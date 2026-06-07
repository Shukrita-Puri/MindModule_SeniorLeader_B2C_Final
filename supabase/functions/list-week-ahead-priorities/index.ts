/**
 * list-week-ahead-priorities
 *
 * Returns ~10 important upcoming-week events for the Week-Ahead Planning
 * surface (Sat / Sun / last-day-of-PTO / last-day-of-holiday).
 *
 * Pipeline (all reuse — no new taxonomy):
 *   1. Pull events in [now, now + lookaheadDays] (local).
 *   2. classifyEvent + coarseEventType for category / type bucket.
 *   3. Stakes-based score + priority-memory delta (from event_priority_memory).
 *   4. Drop hard-demoted ('never') events.
 *   5. Per-day cap (3) + per-category cap (3) for variety, take top 10.
 *
 * Auth: Auth0 JWT via _shared/auth.ts. Dev mode bypassed via x-dev-user-id
 * header outside production, mirroring list-replacement-calendar-events.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.3.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  collapseDuplicateEvents,
  periodFor,
} from "../_shared/rules/calendarEvents.ts";
import {
  classifyEvent,
  coarseEventType,
  isEducationalTitle,
  isNoiseTitle,
} from "../_shared/events/event-classifier.ts";
import {
  evaluateWeekAheadMode,
  normalizeEventTypeKey,
} from "../_shared/plan/week-ahead-mode.ts";
import {
  applyEventPriorityMemory,
  loadPriorityMemoryForUser,
} from "../_shared/plan/event-priority-memory.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-user-tz-offset, x-client-platform, x-week-ahead-override",
};

interface CalendarEventRow {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  provider?: string | null;
  is_organizer?: boolean | null;
  attendees_count?: number | null;
  is_recurring?: boolean | null;
}

const CATEGORY_CAP = 3;
const PER_DAY_CAP = 3;
const TOP_N = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let userId: string | null = null;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const env = Deno.env.get("ENVIRONMENT") || "";
      if (env !== "production") {
        const devHeader = req.headers.get("x-dev-user-id");
        if (devHeader) userId = devHeader;
        else return auth.errorResponse;
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const offsetParam = req.headers.get("x-user-tz-offset");
    const offsetMinutes = offsetParam != null && offsetParam !== ""
      ? Number(offsetParam)
      : new Date().getTimezoneOffset();
    const manualOverride = req.headers.get("x-week-ahead-override") === "1";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Local "now" + local day boundaries.
    const nowUtc = new Date();
    const localNow = new Date(nowUtc.getTime() - offsetMinutes * 60_000);
    const localStartOfToday = new Date(localNow);
    localStartOfToday.setHours(0, 0, 0, 0);
    const localEnd = new Date(localStartOfToday);
    localEnd.setDate(localEnd.getDate() + 8); // 7 lookahead days, exclusive
    const windowStartUtc = new Date(localStartOfToday.getTime() + offsetMinutes * 60_000);
    const windowEndUtc = new Date(localEnd.getTime() + offsetMinutes * 60_000);

    // Week-ahead-mode evaluation (server-derived; PTO/holiday signals are
    // intentionally minimal in MVP — manualOverride is the universal escape).
    const decision = evaluateWeekAheadMode({
      dayOfWeek: localNow.getDay(),
      localHour: localNow.getHours(),
      manualOverride,
    });

    // Pull events (multi-provider) with dedupe — mirrors list-replacement-calendar-events.
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, provider, is_organizer, attendees_count, is_recurring")
      .eq("user_id", userId)
      .gte("start_time", windowStartUtc.toISOString())
      .lt("start_time", windowEndUtc.toISOString())
      .order("start_time", { ascending: true });
    if (error) {
      console.warn("[list-week-ahead-priorities] event query error:", error.message);
    }
    const rows = (data ?? []) as CalendarEventRow[];

    const rawEvents = rows
      .filter((r) => r?.id && r?.title && r?.start_time && r?.end_time)
      .map((r) => ({
        id: String(r.id),
        title: String(r.title),
        startTime: String(r.start_time),
        endTime: String(r.end_time),
        provider: r.provider ?? null,
        attendeesCount: r.attendees_count ?? null,
        isOrganizer: r.is_organizer ?? null,
        isRecurring: r.is_recurring ?? null,
      }));

    const platform = (req.headers.get("x-client-platform") || "web").toLowerCase().includes("ios")
      ? "ios" : "web";
    const deduped = collapseDuplicateEvents(rawEvents, platform as "ios" | "web");

    const memoryIndex = await loadPriorityMemoryForUser(supabase, userId);

    type Scored = {
      eventId: string;
      title: string;
      startTime: string;
      endTime: string;
      localDay: string;            // YYYY-MM-DD (local)
      period: string;
      category: string;            // coarse token (e.g. 'board')
      typeKey: string;             // normalized bucket
      stakesLevel: number;         // 1–5
      score: number;
      scoreReasons: string[];
      isOrganizer: boolean | null;
    };

    const scored: Scored[] = [];
    for (const e of deduped) {
      if (isNoiseTitle(e.title)) continue;
      // Educational + not-organizer is a hard gate, mirroring Plan rules.
      if (isEducationalTitle(e.title) && e.isOrganizer === false) continue;

      const subtype = classifyEvent(e.title, e.attendeesCount ?? null, null, e.isRecurring ?? null);
      const stakes = subtype?.stakesLevel ?? 0;
      const category = coarseEventType(e.title);
      const typeKey = normalizeEventTypeKey(e.title);

      // Base score: stakes-weighted + organizer + attendee boost. Deliberately
      // conservative — full ranking lives in generate-mastery-plan; this surface
      // only needs to rank ~10 events for human review.
      let score = stakes * 12;
      const reasons: string[] = [];
      if (stakes >= 4) reasons.push("high stakes");
      else if (stakes >= 3) reasons.push("important");
      if (e.isOrganizer) { score += 5; reasons.push("you're organising"); }
      if ((e.attendeesCount ?? 0) >= 5) { score += 4; reasons.push(`${e.attendeesCount} attendees`); }

      // Memory boost — historical learning.
      const mem = applyEventPriorityMemory(memoryIndex, {
        eventCategory: category,
        eventTypeKey: typeKey,
      });
      if (mem.hardDemote) continue;
      score += mem.delta;
      reasons.push(...mem.reasons);

      if (score < 10) continue; // very low signal floor

      const localStart = new Date(new Date(e.startTime).getTime() - offsetMinutes * 60_000);
      const localDay =
        `${localStart.getFullYear()}-${String(localStart.getMonth() + 1).padStart(2, "0")}-${String(localStart.getDate()).padStart(2, "0")}`;

      scored.push({
        eventId: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        localDay,
        period: periodFor(localStart),
        category,
        typeKey,
        stakesLevel: stakes,
        score,
        scoreReasons: reasons.slice(0, 3),
        isOrganizer: e.isOrganizer,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    // Apply per-day + per-category caps for variety, then truncate.
    const perDay = new Map<string, number>();
    const perCategory = new Map<string, number>();
    const picked: Scored[] = [];
    for (const s of scored) {
      if (picked.length >= TOP_N) break;
      const d = perDay.get(s.localDay) ?? 0;
      const c = perCategory.get(s.category) ?? 0;
      if (d >= PER_DAY_CAP) continue;
      if (c >= CATEGORY_CAP) continue;
      picked.push(s);
      perDay.set(s.localDay, d + 1);
      perCategory.set(s.category, c + 1);
    }

    // Re-sort the selected slice by chronological start time for UI rendering.
    picked.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return new Response(JSON.stringify({
      weekAheadMode: decision,
      priorities: picked,
      generatedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[list-week-ahead-priorities] fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});