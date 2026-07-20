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
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import {
  mergeCalendarEvents,
  periodFor,
} from "../_shared/rules/calendarEvents.ts";
import { logMergeStats } from "../_shared/rules/calendar-merge.ts";
import {
  classifyEvent,
} from "../_shared/events/event-classifier.ts";
import { EVENT_CATEGORIES } from "../_shared/events/event-categories.ts";
import {
  evaluateWeekAheadMode,
  normalizeEventTypeKey,
} from "../_shared/plan/week-ahead-mode.ts";
import { loadJitContextForEvents } from "../_shared/jit/load-jit-context.ts";
import { enrichEvent } from "../_shared/events/enrich-event.ts";
import { patternHit } from "../_shared/jit/tactical-signals.ts";
import { PTO_TITLE_RX } from "../_shared/availability/availability-classifier.ts";

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

// No per-category cap, no top-N truncation — Week-Ahead is a full human
// triage list. Ordering is by tag/stakes; the UI groups by day.

/** Week-Ahead tag vocabulary (advisory only; NEVER used to filter). */
type WeekAheadTag =
  | "prior_priority"
  | "pattern_based"
  | "known_relationship"
  | "high_stakes"
  | "historically_low_signal";

const TAG_LABEL: Record<WeekAheadTag, string> = {
  prior_priority: "prior priority",
  pattern_based: "recurring pressure pattern",
  known_relationship: "known relationship",
  high_stakes: "high stakes",
  historically_low_signal: "historically low-signal",
};

/** User decisions recorded via `record-event-priority-signal` — surfaced back
 *  to the picker UI so Star/Cancel/Never selections persist across refresh. */
type PriorSignal = "priority" | "not_this_week" | "never";
const PRIOR_SIGNALS: ReadonlySet<PriorSignal> = new Set([
  "priority",
  "not_this_week",
  "never",
]);

/** User-friendly bucket label aligned with the Plan card vocabulary. */
function categoryLabelFor(title: string, categoryId: string | null): string {
  const subtype = classifyEvent(title);
  if (subtype) return subtype.bucket;
  return (categoryId && EVENT_CATEGORIES[categoryId]?.name) || "Meeting";
}

/** All-day OOO / holiday block: full-day duration AND PTO-flavoured title. */
function isAllDayOoo(title: string, startMs: number, endMs: number): boolean {
  if (!PTO_TITLE_RX.test(title || "")) return false;
  const durMs = endMs - startMs;
  return durMs >= 20 * 60 * 60_000; // ≥20h ⇒ effectively an all-day block
}

/** Declined by user OR cancelled by organiser (best-effort from metadata). */
function isDeclinedOrCancelled(
  // deno-lint-ignore no-explicit-any
  eventMetadata: Record<string, any> | null,
): boolean {
  if (!eventMetadata || typeof eventMetadata !== "object") return false;
  const status = String(eventMetadata.status ?? "").toLowerCase();
  if (status === "cancelled") return true;
  const signals = (eventMetadata as any).attendeeSignals ?? eventMetadata;
  const self = signals?.selfResponse ?? signals?.self?.responseStatus ?? null;
  if (typeof self === "string" && self.toLowerCase() === "declined") return true;
  return false;
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
        console.log("[week_ahead.save.success]", { userId: redactUserId(userId), weekStart });
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
      tags: WeekAheadTag[];
      isOrganizer: boolean | null;
      /** Last decision recorded by the user for THIS event via the picker
       *  (source='week_ahead_picker'). Null when the user hasn't chosen
       *  yet — the UI uses this to rehydrate Star / Not this week / Never
       *  state across refreshes. */
      priorSignal: PriorSignal | null;
      /** WS-A · Subcategory reader. Prefers the value persisted by
       *  `record-event-priority-signal` on the most recent memory row for
       *  this event; falls back to `enrichEvent(title).subcategoryId` when
       *  no row has been written yet (older events, first-touch events).
       *  Additive: consumers may ignore this. */
      subcategoryId: string | null;
    };

    // ── Human-first triage: show EVERY real event, tag but never filter. ──
    // Only hard hides: declined/cancelled and all-day OOO/holiday blocks.
    // See mem://features/notifications/week-ahead-picker-trigger.md and
    // the "Rank, never filter" plan in .lovable/plan.md.
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
    type Meta = {
      startTime: string;
      endTime: string;
      localDay: string;
      period: string;
      typeKey: string;
      isOrganizer: boolean | null;
      title: string;
      attendeesCount: number | null;
      // deno-lint-ignore no-explicit-any
      eventMetadata: Record<string, any> | null;
    };
    const metaById = new Map<string, Meta>();

    for (const e of deduped) {
      const startMs = new Date(e.startTime).getTime();
      const endMs = new Date(e.endTime).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      // Hard hides only.
      if (isDeclinedOrCancelled((e as any).eventMetadata ?? null)) continue;
      if (isAllDayOoo(e.title, startMs, endMs)) continue;

      const localStart = new Date(startMs - offsetMinutes * 60_000);
      const localDay =
        `${localStart.getFullYear()}-${String(localStart.getMonth() + 1).padStart(2, "0")}-${String(localStart.getDate()).padStart(2, "0")}`;
      metaById.set(e.id, {
        startTime: e.startTime,
        endTime: e.endTime,
        localDay,
        period: periodFor(localStart),
        typeKey: normalizeEventTypeKey(e.title),
        isOrganizer: e.isOrganizer,
        title: e.title,
        attendeesCount: e.attendeesCount ?? null,
        eventMetadata: (e as any).eventMetadata ?? null,
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

    // Load memory / relationships / pattern context (READ-ONLY: used to
    // annotate, never to exclude).
    const { input, ctx } = await loadJitContextForEvents(
      supabase,
      userId,
      selectorRows,
      { nowMs: Date.now() },
    );
    const inputById = new Map(input.map((i) => [i.id, i]));

    // ── Rehydrate prior user decisions (Star / Cancel / Never) ──────────
    // event_priority_memory is the source of truth for picker actions.
    // We surface the most recent per-event decision so the UI can show
    // the selected state after refresh instead of appearing to have
    // "lost" the user's choice.
    const priorByEventId = new Map<string, PriorSignal>();
    // WS-A · Persisted subcategory keyed by event_id. Populated from the
    // same query as `priorByEventId` so we do not add a round-trip. Any
    // signal type is acceptable as a subcategory carrier — the classifier
    // stamps the same subcategory across signals for a given event.
    const subcategoryByEventId = new Map<string, string>();
    const eventIdList = Array.from(metaById.keys());
    if (eventIdList.length > 0) {
      try {
        const { data: priorRows } = await supabase
          .from("event_priority_memory")
          .select("event_id, signal, source, occurred_at, event_subcategory")
          .eq("user_id", userId)
          .in("event_id", eventIdList)
          .order("occurred_at", { ascending: false });
        for (const r of (priorRows ?? []) as any[]) {
          if (!r?.event_id) continue;
          // Prior signal only accepts week_ahead_picker actions.
          if (
            !priorByEventId.has(r.event_id) &&
            r.source === "week_ahead_picker" &&
            PRIOR_SIGNALS.has(r.signal as PriorSignal)
          ) {
            priorByEventId.set(r.event_id, r.signal as PriorSignal);
          }
          // Subcategory: accept from ANY memory row (writer stamps it on
          // every signal). First (most recent) hit wins.
          if (
            !subcategoryByEventId.has(r.event_id) &&
            typeof r.event_subcategory === "string" &&
            r.event_subcategory
          ) {
            subcategoryByEventId.set(r.event_id, r.event_subcategory);
          }
        }
      } catch (_e) { /* best-effort — picker still functions without it */ }
    }

    // Stakes rank for ordering.
    const STAKES_RANK: Record<string, number> = {
      A: 8, B: 7, C: 6, D: 5, E: 4, F: 3, G: 2, H: 1,
    };

    const scored: Scored[] = [];
    for (const [eventId, meta] of metaById.entries()) {
      const enriched = enrichEvent({ title: meta.title });
      const categoryId = enriched.categoryId;
      const stakesRank = categoryId ? (STAKES_RANK[categoryId] ?? 0) : 0;
      const stakesLevel = categoryId === "A"
        ? (meta.title.toLowerCase().includes("investor") ? "investor" : "board")
        : ((categoryId === "B" || categoryId === "C") ? "external" : null);

      // ── Tags (advisory only) ────────────────────────────────────────
      const tags: WeekAheadTag[] = [];
      const memEntry = ctx.memoryDeltaByEventId?.[eventId];
      const memDelta = memEntry?.delta ?? 0;
      // "Prior priority" MUST reflect a genuine cross-day pattern.
      // A single star tapped an hour ago satisfies `memDelta >= 8` alone
      // but has no historical meaning yet. Gate on the priority-memory
      // helper's `hasPriorDayPriority` flag, which is true iff at least
      // one `priority` row (within the 60d window) has an `occurred_at`
      // UTC date strictly before today's UTC date.
      if (memDelta >= 8 && memEntry?.hasPriorDayPriority) {
        tags.push("prior_priority");
      }
      const { score: pScore } = patternHit(meta.title, ctx.signalSummary);
      if (pScore >= 10) tags.push("pattern_based");
      const inputRow = inputById.get(eventId);
      const roles = inputRow?.attendeeRoles ?? [];
      const hasKnownRel = Array.isArray(roles) && roles.some((r: any) =>
        r && r.role && r.role !== "unknown" &&
        (r.source === "user_tag" || r.source === "memory_user_tag" || r.source === "llm")
      );
      if (hasKnownRel) tags.push("known_relationship");
      if (categoryId === "A" || categoryId === "B" || categoryId === "C") {
        tags.push("high_stakes");
      }
      if (memDelta <= -10 || memEntry?.hardDemote) {
        tags.push("historically_low_signal");
      }

      // Ordering score — never used to exclude.
      const priorBoost = tags.includes("prior_priority") ? 1000 : 0;
      const patternBoost = tags.includes("pattern_based") ? 500 : 0;
      const stakesBoost = stakesRank * 10;
      const orderScore = priorBoost + patternBoost + stakesBoost;

      // Pin `prior_priority` to the front of the visible chip list so it
      // survives the top-3 truncation even when other advisory tags also fire.
      const orderedTags = tags.includes("prior_priority")
        ? (["prior_priority", ...tags.filter((t) => t !== "prior_priority")] as WeekAheadTag[])
        : tags;
      scored.push({
        eventId,
        title: meta.title,
        startTime: meta.startTime,
        endTime: meta.endTime,
        localDay: meta.localDay,
        period: meta.period,
        category: categoryLabelFor(meta.title, categoryId),
        typeKey: meta.typeKey,
        stakesLevel,
        score: orderScore,
        scoreReasons: orderedTags.map((t) => TAG_LABEL[t]).slice(0, 3),
        tags: orderedTags,
        isOrganizer: meta.isOrganizer,
        priorSignal: priorByEventId.get(eventId) ?? null,
        // WS-A · Persisted subcategory (if any) beats the on-the-fly
        // classifier; fall back to `enrichEvent` when no memory row exists.
        subcategoryId: subcategoryByEventId.get(eventId)
          ?? (enriched as any).subcategoryId
          ?? null,
      });
    }

    // No per-category cap, no top-N truncation. Return everything.
    // Emphasis order handled by score; final list stays chronological for UI.
    const picked = scored.slice().sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // ── Persist Week Ahead snapshot (Sun → Plan memory for the week) ──
    // Upsert by (user_id, week_start_date, source) so repeated Sunday
    // refreshes do not duplicate rows. Best-effort; never break the API.
    try {
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
        console.warn("[week_ahead.write.error]", upsertErr.message, { userId: redactUserId(userId), weekStart });
      } else {
        console.log("[week_ahead.write.success]", { userId: redactUserId(userId), weekStart, weekEnd, count: picked.length });
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
