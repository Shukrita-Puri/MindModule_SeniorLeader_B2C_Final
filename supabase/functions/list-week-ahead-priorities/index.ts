/**
 * list-week-ahead-priorities
 *
 * Returns ~10 important upcoming-week events for the Week-Ahead Planning
 * surface (Sun / last-day-of-PTO / last-day-of-holiday / last-day-of-long-
 * weekend / manual `?mode=week-ahead`). Saturday is NOT a Week-Ahead day —
 * it is a recovery day handled by the Brief.
 *
 * Pipeline (all reuse — no new taxonomy):
 *   1. Pull events in [now, now + lookaheadDays] (local).
 *   2. Drop noise / educational-not-organiser; classify category + type bucket.
 *   3. Score with the same `rankJitCandidates` ranker the weekday Plan uses
 *      (stakes-base + category + severity + demand profile + proximity) plus
 *      `applyEventPriorityMemory` learning delta from `event_priority_memory`.
 *   4. Drop hard-demoted ('never') events.
 *   5. Soft per-category cap (4) for variety — NO per-day cap (week planner).
 *      Take top 10 by score, then re-sort chronologically for UI.
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
  mergeCalendarEvents,
  periodFor,
} from "../_shared/rules/calendarEvents.ts";
import {
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
import {
  rankJitCandidates,
  type RankableEventInput,
} from "../_shared/events/jit-candidates.ts";

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

const PER_CATEGORY_SOFT_CAP = 4;
const TOP_N = 10;

/** Derive the stakes-level token the unified ranker (`rankJitCandidates`)
 *  consumes. Mirrors `toBriefEvents` in _shared/signal-engine/db-queries.ts so
 *  the picker shares the same coarse-stakes vocabulary as the Brief. */
function deriveStakesLevel(title: string): string | null {
  const coarse = coarseEventType(title);
  if (coarse === "board") return "board";
  if (coarse === "investor") return "investor";
  if (
    coarse === "ma" || coarse === "fundraising" || coarse === "client" ||
    coarse === "media-interview" || coarse === "speaking" || coarse === "crisis"
  ) return "external";
  return null;
}

function componentReasons(c: {
  base: number;
  category: number;
  severity: number;
  demand: number;
}, opts: { isOrganizer: boolean | null; attendees: number | null }): string[] {
  const out: string[] = [];
  if (c.base >= 30) out.push("high stakes");
  else if (c.base >= 20) out.push("important");
  if (c.category >= 20) out.push("decision-critical");
  else if (c.category >= 15) out.push("strategic");
  if (c.severity >= 15) out.push("high severity");
  if (opts.isOrganizer) out.push("you're organising");
  if ((opts.attendees ?? 0) >= 5) out.push(`${opts.attendees} attendees`);
  return out;
}

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
    const deduped = mergeCalendarEvents(rawEvents, platform as "ios" | "web");

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
      stakesLevel: string | null;  // 'board' | 'investor' | 'external' | null
      score: number;
      scoreReasons: string[];
      isOrganizer: boolean | null;
    };

    // ── Filter + classify + build ranker inputs in one pass ──
    type Meta = {
      eventId: string;
      title: string;
      startTime: string;
      endTime: string;
      localDay: string;
      period: string;
      category: string;
      typeKey: string;
      stakesLevel: string | null;
      isOrganizer: boolean | null;
      attendees: number | null;
      memoryReasons: string[];
    };

    const metaById = new Map<string, Meta>();
    const rankerInputs: RankableEventInput[] = [];

    for (const e of deduped) {
      if (isNoiseTitle(e.title)) continue;
      if (isEducationalTitle(e.title) && e.isOrganizer === false) continue;

      const category = coarseEventType(e.title);
      const typeKey = normalizeEventTypeKey(e.title);
      const stakesLevel = deriveStakesLevel(e.title);

      const mem = applyEventPriorityMemory(memoryIndex, {
        eventCategory: category,
        eventTypeKey: typeKey,
      });
      if (mem.hardDemote) continue;

      const localStart = new Date(new Date(e.startTime).getTime() - offsetMinutes * 60_000);
      const localDay =
        `${localStart.getFullYear()}-${String(localStart.getMonth() + 1).padStart(2, "0")}-${String(localStart.getDate()).padStart(2, "0")}`;

      metaById.set(e.id, {
        eventId: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        localDay,
        period: periodFor(localStart),
        category,
        typeKey,
        stakesLevel,
        isOrganizer: e.isOrganizer,
        attendees: e.attendeesCount,
        memoryReasons: mem.reasons,
      });

      rankerInputs.push({
        event: { id: e.id, title: e.title, start_time: e.startTime, end_time: e.endTime },
        stakesLevel,
        memoryDelta: mem.delta,
      });
    }

    // ── Score via the same ranker the weekday Plan uses ──
    const ranked = rankJitCandidates(rankerInputs, Date.now());

    // Collapse to one row per event (best-scoring phase wins).
    const bestByEvent = new Map<string, typeof ranked[number]>();
    for (const r of ranked) {
      const cur = bestByEvent.get(r.eventId);
      if (!cur || r.score > cur.score) bestByEvent.set(r.eventId, r);
    }

    const scored: Scored[] = [];
    for (const [eventId, r] of bestByEvent) {
      const meta = metaById.get(eventId);
      if (!meta) continue;
      const reasons = [
        ...componentReasons(r.components, {
          isOrganizer: meta.isOrganizer,
          attendees: meta.attendees,
        }),
        ...meta.memoryReasons,
      ];
      scored.push({
        eventId,
        title: meta.title,
        startTime: meta.startTime,
        endTime: meta.endTime,
        localDay: meta.localDay,
        period: meta.period,
        category: meta.category,
        typeKey: meta.typeKey,
        stakesLevel: meta.stakesLevel,
        score: r.score,
        scoreReasons: reasons.slice(0, 3),
        isOrganizer: meta.isOrganizer,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    // Soft per-category cap only (no per-day cap — this is a week planner).
    const perCategory = new Map<string, number>();
    const picked: Scored[] = [];
    for (const s of scored) {
      if (picked.length >= TOP_N) break;
      const c = perCategory.get(s.category) ?? 0;
      if (c >= PER_CATEGORY_SOFT_CAP) continue;
      picked.push(s);
      perCategory.set(s.category, c + 1);
    }
    // If the soft cap was too restrictive (small calendars dominated by one
    // bucket), backfill with the next-best events to honour the top-10 goal.
    if (picked.length < TOP_N) {
      const pickedIds = new Set(picked.map((p) => p.eventId));
      for (const s of scored) {
        if (picked.length >= TOP_N) break;
        if (pickedIds.has(s.eventId)) continue;
        picked.push(s);
        pickedIds.add(s.eventId);
      }
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
