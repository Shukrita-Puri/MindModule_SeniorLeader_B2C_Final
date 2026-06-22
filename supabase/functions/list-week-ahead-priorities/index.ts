/**
 * list-week-ahead-priorities
 *
 * Returns ~10 important upcoming-week events for the Week-Ahead Planning
 * surface (Sun / last-day-of-PTO / last-day-of-holiday / last-day-of-long-
 * weekend / manual `?mode=week-ahead`). Saturday is NOT a Week-Ahead day —
 * it is a recovery day handled by the Brief.
 *
 * Pipeline (all reuse — no new taxonomy):
 *   1. Pull events in [now, now + 7d] (local) and dedupe across providers.
 *   2. Drop noise / educational-not-organiser.
 *   3. Run the SAME `selectJitCandidates` triangulated selector used by the
 *      weekday Plan — Immediate + Tactical + Strategic + Sovereign + Memory,
 *      with a 7-day horizon override. Loads attendee relationships, sovereign
 *      tags from event_priority_memory, derived memoryDelta, signal_summary
 *      and account-age tier weights via the shared `loadJitContextForEvents`.
 *   4. Soft per-category cap (4) for variety — NO per-day cap (week planner).
 *      Take top 10 by `importance`, then re-sort chronologically for UI.
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
import { logMergeStats } from "../_shared/rules/calendar-merge.ts";
import {
  isEducationalTitle,
  isNoiseTitle,
  classifyEvent,
} from "../_shared/events/event-classifier.ts";
import { EVENT_CATEGORIES } from "../_shared/events/event-categories.ts";
import {
  evaluateWeekAheadMode,
  normalizeEventTypeKey,
} from "../_shared/plan/week-ahead-mode.ts";
import { loadJitContextForEvents } from "../_shared/jit/load-jit-context.ts";
import {
  selectJitCandidates,
  type SelectedCandidate,
} from "../_shared/jit/select-jit.ts";

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
  // deno-lint-ignore no-explicit-any
  event_metadata?: Record<string, any> | null;
  created_at?: string | null;
}

const PER_CATEGORY_SOFT_CAP = 4;
const TOP_N = 10;
const WEEK_AHEAD_HORIZON_MS = 7 * 24 * 60 * 60_000;

/** Plan-aligned reason strings derived from the SelectedCandidate breakdown. */
function reasonsFor(c: SelectedCandidate): string[] {
  const b = c.components.breakdown;
  const out: string[] = [];
  if (c.components.sovereignBonus >= 45) out.push("you tagged this high");
  else if (c.components.sovereignBonus >= 20) out.push("you tagged this");
  if (b.relationship_sovereign >= 15) out.push("known relationship");
  else if (b.relationshipLeads) out.push("relationship-led");
  if (b.situationalBoost >= 15) out.push("interview");
  else if (b.situationalBoost >= 6) out.push("hiring");
  if (b.categoryBase >= 35) out.push("high stakes");
  else if (b.categoryBase >= 25) out.push("important");
  if (b.patternScore >= 10) out.push("recurring pressure pattern");
  if (c.components.memoryDelta >= 8) out.push("prior priority");
  else if (c.components.memoryDelta <= -10) out.push("historically low-signal");
  return Array.from(new Set(out)).slice(0, 3);
}

/** User-friendly bucket label aligned with the Plan card vocabulary. */
function categoryLabelFor(title: string, c: SelectedCandidate): string {
  const subtype = classifyEvent(title);
  if (subtype) return subtype.bucket;
  return EVENT_CATEGORIES[c.categoryId]?.name ?? "Meeting";
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

    // Compute current local Mon→Sun (used by both the GET write path and the
    // POST save path).
    const dow = localNow.getDay();
    const daysFromMonday = (dow + 6) % 7;
    const localMonday = new Date(localStartOfToday);
    localMonday.setDate(localMonday.getDate() - daysFromMonday);
    const localSunday = new Date(localMonday);
    localSunday.setDate(localSunday.getDate() + 6);
    const fmtLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const weekStart = fmtLocalDate(localMonday);
    const weekEnd = fmtLocalDate(localSunday);

    // ── Save path: POST with { action: 'save', selected_plan?, user_edits? }
    // Upserts into the current week's row WITHOUT overwriting generated
    // priorities. Returns immediately; never falls through to listing.
    if (req.method === "POST") {
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      if (body && body.action === "save") {
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.selected_plan !== undefined) update.selected_plan = body.selected_plan;
        if (body.user_edits !== undefined) update.user_edits = body.user_edits;

        const { data: existing } = await supabase
          .from("weekly_plan_snapshots")
          .select("id")
          .eq("user_id", userId)
          .eq("week_start_date", weekStart)
          .eq("source", "sunday_week_ahead")
          .maybeSingle();

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from("weekly_plan_snapshots")
            .update(update)
            .eq("id", existing.id);
          if (updErr) {
            return new Response(JSON.stringify({ error: updErr.message }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          const { error: insErr } = await supabase
            .from("weekly_plan_snapshots")
            .insert({
              user_id: userId,
              week_start_date: weekStart,
              week_end_date: weekEnd,
              source: "sunday_week_ahead",
              priorities: [],
              selected_plan: update.selected_plan ?? null,
              user_edits: update.user_edits ?? null,
            });
          if (insErr) {
            return new Response(JSON.stringify({ error: insErr.message }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        console.log("[week_ahead.save.success]", { userId, weekStart });
        return new Response(JSON.stringify({ ok: true, weekStartDate: weekStart }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
      .select("id, title, start_time, end_time, provider, is_organizer, attendees_count, is_recurring, event_metadata, created_at")
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
        eventMetadata: r.event_metadata ?? null,
        createdAt: r.created_at ?? null,
      }));

    const platform = (req.headers.get("x-client-platform") || "web").toLowerCase().includes("ios")
      ? "ios" : "web";
    const deduped = mergeCalendarEvents(rawEvents, platform as "ios" | "web");
    logMergeStats("week-ahead", rawEvents.length, deduped as any, { userId });

    type Scored = {
      eventId: string;
      title: string;
      startTime: string;
      endTime: string;
      localDay: string;            // YYYY-MM-DD (local)
      period: string;
      category: string;            // user-friendly bucket label
      typeKey: string;             // normalized bucket
      stakesLevel: string | null;  // 'board' | 'investor' | 'external' | null
      score: number;
      scoreReasons: string[];
      isOrganizer: boolean | null;
    };

    // ── Filter noise / passive educational and prep selector inputs ──
    type Meta = {
      startTime: string;
      endTime: string;
      localDay: string;
      period: string;
      typeKey: string;
      isOrganizer: boolean | null;
    };
    const metaById = new Map<string, Meta>();
    const selectorRows: Array<{
      id: string;
      title: string;
      start_time: string;
      end_time: string;
      created_at: string | null;
      provider: string | null;
      attendees_count: number | null;
      is_organizer: boolean | null;
      // deno-lint-ignore no-explicit-any
      event_metadata: Record<string, any> | null;
    }> = [];

    for (const e of deduped) {
      if (isNoiseTitle(e.title)) continue;
      if (isEducationalTitle(e.title) && e.isOrganizer === false) continue;

      const localStart = new Date(new Date(e.startTime).getTime() - offsetMinutes * 60_000);
      const localDay =
        `${localStart.getFullYear()}-${String(localStart.getMonth() + 1).padStart(2, "0")}-${String(localStart.getDate()).padStart(2, "0")}`;
      metaById.set(e.id, {
        startTime: e.startTime,
        endTime: e.endTime,
        localDay,
        period: periodFor(localStart),
        typeKey: normalizeEventTypeKey(e.title),
        isOrganizer: e.isOrganizer,
      });
      selectorRows.push({
        id: e.id,
        title: e.title,
        start_time: e.startTime,
        end_time: e.endTime,
        created_at: (e as any).createdAt ?? null,
        provider: e.provider ?? null,
        attendees_count: e.attendeesCount ?? null,
        is_organizer: e.isOrganizer ?? null,
        event_metadata: (e as any).eventMetadata ?? null,
      });
    }

    // ── Run the unified Plan/JIT selector with a 7-day horizon ──
    const { input, ctx } = await loadJitContextForEvents(
      supabase,
      userId,
      selectorRows,
      { nowMs: Date.now() },
    );
    const result = selectJitCandidates(input, {
      ...ctx,
      horizonMs: WEEK_AHEAD_HORIZON_MS,
    });

    const scored: Scored[] = [];
    for (const c of result.ranked) {
      const meta = metaById.get(c.eventId);
      if (!meta) continue;
      const bucketLower = (c.bucket ?? "").toLowerCase();
      const stakesLevel = c.categoryId === "A"
        ? (bucketLower.includes("investor") ? "investor" : "board")
        : ((c.categoryId === "B" || c.categoryId === "C") ? "external" : null);
      scored.push({
        eventId: c.eventId,
        title: c.title,
        startTime: meta.startTime,
        endTime: meta.endTime,
        localDay: meta.localDay,
        period: meta.period,
        category: categoryLabelFor(c.title, c),
        typeKey: meta.typeKey,
        stakesLevel,
        score: c.importance,
        scoreReasons: reasonsFor(c),
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

    // ── Persist Week Ahead snapshot (Sun → Plan memory for the week) ──
    // Week is Mon→Sun based on the user's local "today". Upsert by
    // (user_id, week_start_date, source) so repeated Sunday refreshes do
    // not duplicate rows. Best-effort; failures must not break the API.
    try {
      const dow = localNow.getDay(); // 0 Sun..6 Sat
      const daysFromMonday = (dow + 6) % 7; // Mon=0
      const localMonday = new Date(localStartOfToday);
      localMonday.setDate(localMonday.getDate() - daysFromMonday);
      const localSunday = new Date(localMonday);
      localSunday.setDate(localSunday.getDate() + 6);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const weekStart = fmt(localMonday);
      const weekEnd = fmt(localSunday);

      const { error: upsertErr } = await supabase
        .from("weekly_plan_snapshots")
        .upsert(
          {
            user_id: userId,
            week_start_date: weekStart,
            week_end_date: weekEnd,
            source: "sunday_week_ahead",
            priorities: picked,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,week_start_date,source" },
        );
      if (upsertErr) {
        console.warn("[week_ahead.write.error]", upsertErr.message, { userId, weekStart });
      } else {
        console.log("[week_ahead.write.success]", { userId, weekStart, weekEnd, count: picked.length });
      }
    } catch (e) {
      console.warn("[week_ahead.write.error] threw:", (e as Error).message);
    }

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
