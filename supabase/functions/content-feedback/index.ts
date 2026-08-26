import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { dayOfWeekFromIsoDate } from "../_shared/signal-engine/day-kind-detector.ts";
import { enrich as enrichCalendarEvent } from "../_shared/events/pattern-bucket.ts";
import { mergeCalendarEvents } from "../_shared/rules/calendarEvents.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

// Category + subcategory come ONLY from the canonical A–H resolver
// (`enrichCalendarEvent` → resolveEvent). No keyword matching here.
interface DominantDayType {
  dayType: string;
  secondaryCategory: string | null; // diagnostics only — never rendered
}

function durationMinutesOf(e: any): number {
  const s = e?.start_time ? new Date(e.start_time).getTime() : NaN;
  const en = e?.end_time ? new Date(e.end_time).getTime() : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) return 0;
  return Math.round((en - s) / 60000);
}

function classifyDominantDayType(events: any[], loadMinutes: number): DominantDayType {
  const resolved = events.map((e) => {
    const en = enrichCalendarEvent(e) as any;
    return {
      cat: (en?.categoryId ?? null) as string | null,
      sub: (en?.subcategory ?? null) as string | null,
      mins: durationMinutesOf(e),
    };
  });

  const minutesByCategory = new Map<string, number>();
  resolved.forEach((r) => {
    if (!r.cat) return;
    minutesByCategory.set(r.cat, (minutesByCategory.get(r.cat) ?? 0) + r.mins);
  });
  const rankedCats = [...minutesByCategory.entries()].sort((a, b) => b[1] - a[1]);
  const secondaryCategory = rankedCats[1]?.[0] ?? null;
  const out = (dayType: string): DominantDayType => ({ dayType, secondaryCategory });

  const inCat = (c: string) => resolved.filter((r) => r.cat === c);
  const totalMins = (c: string) => minutesByCategory.get(c) ?? 0;
  const load = loadMinutes > 0 ? loadMinutes : resolved.reduce((a, r) => a + r.mins, 0);

  // P1 — Travel (hard override)
  if (resolved.some((r) => r.cat === "G" && (r.sub?.includes("flight") || r.sub?.includes("travel_day")))) {
    return out("Travel");
  }

  // P2 — Governance
  const aEvents = inCat("A");
  const governanceGate = aEvents.some((r) => r.mins >= 45) || aEvents.length >= 2;

  // P3 — Visibility
  const performingSubs = ["speaking", "media", "roundtable", "town_hall"];
  const visibilityGate = inCat("C").some(
    (r) =>
      (r.sub != null && performingSubs.includes(r.sub)) ||
      (r.sub === "stakeholder_communication" && r.mins >= 45),
  );

  // P4 — Pitching
  const pitchingGate = inCat("B").length > 0;

  if (governanceGate) return out("Board & Governance");

  if (visibilityGate && pitchingGate) {
    return out(totalMins("B") > totalMins("C") ? "Business Development" : "Visibility & Comms");
  }
  if (visibilityGate) return out("Visibility & Comms");
  if (pitchingGate) return out("Business Development");

  // P5 — High-Stakes
  if (inCat("D").some((r) => r.mins >= 30)) return out("Interpersonal High-Stakes");

  // P6 — Conference (Visibility already returned above when gated)
  if (totalMins("F") >= 120) return out("Conferences & Events");

  // P7 — Deep Work
  const deepMins = resolved
    .filter((r) => r.cat === "E" && (r.sub === "deep_work" || r.sub === "review"))
    .reduce((a, r) => a + r.mins, 0);
  if (load > 0 && deepMins / load >= 0.4) return out("Deep Work & Strategy");

  // P8 — Learning
  const learnMins = resolved
    .filter((r) => r.cat === "E" && (r.sub === "learning" || r.sub === "community"))
    .reduce((a, r) => a + r.mins, 0);
  if (load > 0 && learnMins / load >= 0.4) return out("Learning & Development");

  // P9 — Rhythm
  const hMins = totalMins("H");
  if ((load > 0 && hMins / load >= 0.5) || load < 30) return out("Daily Rhythm & Baseline");

  // P10 — Mixed: ≥2 categories each ≥25% of PROFESSIONAL load (excl. H),
  // spanning ≥2 different demand modes.
  const professionalLoad = [...minutesByCategory.entries()]
    .filter(([c]) => c !== "H")
    .reduce((a, [, m]) => a + m, 0);
  if (professionalLoad > 0) {
    const competing = [...minutesByCategory.entries()].filter(
      ([c, m]) => c !== "H" && m / professionalLoad >= 0.25,
    );
    const modeOf = (c: string): string | null =>
      c === "B" || c === "C" ? "performance" :
      c === "A" ? "governance" :
      c === "D" ? "relational" :
      c === "E" ? "cognitive" :
      c === "F" || c === "G" ? "logistical" : null;
    const modes = new Set(competing.map(([c]) => modeOf(c)).filter(Boolean));
    if (competing.length >= 2 && modes.size >= 2) return out("Mixed");
  }

  return out("Mixed");
}

interface RequestBody {
  action: 'GET_FEEDBACK' | 'SUBMIT_FEEDBACK' | 'UPDATE_SESSION_RATING' | 'GET_PRACTICE_IMPACT' | 'GET_EVENT_OUTCOME_CANDIDATE' | 'SUBMIT_EVENT_OUTCOME';
  lookbackWindow?: 'thirty_days' | 'all_time';
  contentId?: string;
  feedbackData?: {
    content_id: string;
    content_type: string;
    feedback_type: string;
    star_rating?: number;
    session_id?: string;
    trigger_context?: string;
    feedback_text?: string;
    feedback_reason?: string;
    context_data?: Record<string, unknown>;
  };
  sessionId?: string;
  rating?: number;
  qualitativeRating?: string;
  feedbackText?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json() as RequestBody;
    const { action, contentId, feedbackData, sessionId: reqSessionId, rating, qualitativeRating, feedbackText } = body;
    console.log(`[content-feedback] Action: ${action}, User: ${redactUserId(userId)}`);

    const platform: "ios" | "web" =
      (req.headers.get("x-mm-client-platform") || req.headers.get("x-client-platform") || "web")
        .toLowerCase()
        .includes("ios")
        ? "ios"
        : "web";


    switch (action) {
      case 'GET_FEEDBACK': {
        let query = supabase
          .from('content_relevance_feedback')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (contentId) {
          query = query.eq('content_id', contentId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[content-feedback] GET_FEEDBACK error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SUBMIT_FEEDBACK': {
        if (!feedbackData) {
          return new Response(JSON.stringify({ error: 'Missing feedback data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('content_relevance_feedback')
          .insert({
            user_id: userId,
            ...feedbackData,
            timestamp: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('[content-feedback] SUBMIT_FEEDBACK error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Post-event outcome prompt ("How did that go?") for high-demand events.
      // Categories A–D are the demanding ones under the canonical A–H taxonomy.
      case 'GET_EVENT_OUTCOME_CANDIDATE': {
        const nowMs = Date.now();
        const windowStartIso = new Date(nowMs - 6 * 60 * 60 * 1000).toISOString();
        const endedBeforeIso = new Date(nowMs - 20 * 60 * 1000).toISOString();
        const today = new Date().toISOString().slice(0, 10);

        const [evRes, seenRes] = await Promise.all([
          supabase
            .from('calendar_events')
            .select('id, title, start_time, end_time, attendees_count, provider, is_organizer, is_recurring, event_metadata, external_id')
            .eq('user_id', userId)
            .gte('end_time', windowStartIso)
            .lte('end_time', endedBeforeIso)
            .order('end_time', { ascending: false }),
          supabase
            .from('event_outcome_feedback')
            .select('event_id')
            .eq('user_id', userId)
            .gte('event_date', today),
        ]);

        if (evRes.error) throw evRes.error;
        // Raw rows must go through the shared merge layer, otherwise the same
        // meeting synced from two providers can prompt twice.
        const mergedCandidates = mergeCalendarEvents((evRes.data ?? []) as any[], platform);
        const seen = new Set((seenRes.data ?? []).map((r: any) => r.event_id).filter(Boolean));

        let candidate: Record<string, unknown> | null = null;
        for (const e of mergedCandidates as any[]) {
          if (seen.has(e.id)) continue;
          const status = String(e.event_metadata?.status ?? e.event_metadata?.responseStatus ?? '').toLowerCase();
          if (status === 'cancelled' || status === 'tentative') continue;
          const enriched = enrichCalendarEvent(e) as any;
          const cat = enriched?.categoryId ?? null;
          if (!cat || !['A', 'B', 'C', 'D'].includes(cat)) continue;
          if (durationMinutesOf(e) < 20) continue;
          candidate = {
            eventId: e.id,
            title: e.title,
            categoryId: cat,
            subcategory: enriched?.subcategory ?? null,
            endTime: e.end_time,
          };
          break;
        }

        return new Response(JSON.stringify({ data: candidate }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SUBMIT_EVENT_OUTCOME': {
        const outcome = (body as any).eventOutcome as
          | {
              eventId?: string; title?: string; categoryId?: string;
              eventDate?: string; rating?: number; openText?: string;
              practiceIdsUsed?: string[]; triggerContext?: string;
            }
          | undefined;

        if (!outcome || (outcome.rating == null && !outcome.openText)) {
          return new Response(JSON.stringify({ error: 'Missing event outcome payload' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (outcome.rating != null && (outcome.rating < 1 || outcome.rating > 5)) {
          return new Response(JSON.stringify({ error: 'rating must be between 1 and 5' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('event_outcome_feedback')
          .insert({
            user_id: userId,
            event_id: outcome.eventId ?? null,
            event_title: outcome.title ?? null,
            event_type: outcome.categoryId ?? null,
            event_date: outcome.eventDate ?? new Date().toISOString().slice(0, 10),
            rating: outcome.rating ?? null,
            open_text: outcome.openText ? String(outcome.openText).slice(0, 500) : null,
            practice_ids_used: outcome.practiceIdsUsed ?? null,
            trigger_context: outcome.triggerContext ?? 'post_event_prompt',
          })
          .select()
          .single();

        if (error) {
          console.error('[content-feedback] SUBMIT_EVENT_OUTCOME error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }


      case 'UPDATE_SESSION_RATING': {
        // Deprecated: practice ratings now write only to content_relevance_feedback (CRF).
        // Returning 410 Gone so any straggling clients fail loudly instead of silently
        // writing to the now-dead practice_sessions.effectiveness_rating column.
        console.warn('[content-feedback] UPDATE_SESSION_RATING is deprecated — CRF is the single source of truth.');
        return new Response(
          JSON.stringify({
            error: 'UPDATE_SESSION_RATING is deprecated. Use SUBMIT_FEEDBACK with feedback_type=star_rating instead.',
          }),
          {
            status: 410,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'GET_PRACTICE_IMPACT': {
        // Session counting can use all-time history; impact deltas stay
        // bounded to recent data so the measured effect remains relevant.
        const lookbackWindow = body.lookbackWindow ?? 'thirty_days';
        const sessionSinceIso = lookbackWindow === 'all_time'
          ? '2020-01-01T00:00:00.000Z'
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const deltaSinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const deltaSinceDate = deltaSinceIso.slice(0, 10);

        // ── Pull all source data in parallel ─────────────────────
        // NOTE: `sanctuary_events` is a retired write path (last row Apr 2026).
        // Live completions come from `daily_ritual_completions` +
        // post-practice star ratings in `content_relevance_feedback`.
        const [fbRes, drcRes, ciRes, wdRes, favRes, calRes] = await Promise.all([
          supabase
            .from('content_relevance_feedback')
            .select('id, content_id, content_type, star_rating, session_id, trigger_context, created_at, context_data')
            .eq('user_id', userId)
            .eq('feedback_type', 'star_rating')
            .not('star_rating', 'is', null)
            .gte('created_at', deltaSinceIso),
          supabase
            .from('daily_ritual_completions')
            .select('ritual_date, completed_practice_ids, session_period, soundscape_completed_at, guided_practice_completed_at, micro_exercise_completed_at, practice_started_at, practice_completed_at')
            .eq('user_id', userId)
            .gte('ritual_date', sessionSinceIso.slice(0, 10)),
          supabase
            .from('daily_checkins')
            .select('checkin_date, time_window, timestamp, clarity_level, mental_sharpness_level, confidence_level')
            .eq('user_id', userId)
            .gte('checkin_date', deltaSinceDate)
            .order('timestamp', { ascending: true }),
          supabase
            .from('wearable_data')
            .select('summary_date, hrv, resting_heart_rate, hr_samples')
            .eq('user_id', userId)
            .gte('summary_date', deltaSinceDate),
          supabase
            .from('user_favorites')
            .select('content_id')
            .eq('user_id', userId),

          supabase
            .from('calendar_events')
            .select('title, start_time, end_time, attendees_count')
            .eq('user_id', userId)
            .gte('start_time', deltaSinceIso)
            .lte('start_time', new Date().toISOString()),
        ]);

        if (fbRes.error) throw fbRes.error;
        if (drcRes.error) throw drcRes.error;
        if (ciRes.error) throw ciRes.error;
        if (wdRes.error) throw wdRes.error;

        const feedbackRows = (fbRes.data ?? []).filter(
          (r: any) =>
            !r.trigger_context ||
            r.trigger_context === 'post_practice_completion' ||
            r.trigger_context === 'post_plan_completion'
        );
        const checkins = (ciRes.data ?? []) as Array<{
          checkin_date: string; time_window: string | null; timestamp: string;
          clarity_level: number | null; mental_sharpness_level: number | null;
          confidence_level: number | null;
        }>;
        const wearable = (wdRes.data ?? []) as Array<{
          summary_date: string; hrv: number | null; resting_heart_rate: number | null;
          hr_samples: unknown;
        }>;
        const favouriteIds = new Set((favRes.data ?? []).map((f: any) => f.content_id));
        const calendarEvents = mergeCalendarEvents((calRes.data ?? []) as any[], platform) as Array<{
          title: string | null; start_time: string | null; end_time: string | null;
          attendees_count: number | null;
        }>;

        // ── Canonical completion list ───────────────────────────
        // A completion is (content id, local day). Its timestamp is the earliest
        // post-practice rating on that day, else the slot completion timestamp.
        // Without either, it still counts as a session but yields no HR window.
        const ratingAnchors = new Map<string, number>(); // `${id}|${date}` → ms
        for (const r of feedbackRows) {
          if (!r.content_id || !r.created_at) continue;
          const ms = +new Date(r.created_at);
          if (!Number.isFinite(ms)) continue;
          const key = `${r.content_id}|${r.created_at.slice(0, 10)}`;
          const prev = ratingAnchors.get(key);
          if (prev == null || ms < prev) ratingAnchors.set(key, ms);
        }

        // Precise session timing, when the client recorded it.
        // Prefer per-practice timings stored on CRF context_data, then fall back
        // to ritual timings only when a row has exactly one completed practice.
        type PreciseWindow = { startIso: string; endIso: string };
        const preciseByContentDay = new Map<string, PreciseWindow>();
        const setPrecise = (contentId: string, day: string, start: unknown, end: unknown) => {
          if (!contentId || !day || typeof start !== 'string' || typeof end !== 'string') return;
          const sMs = +new Date(start);
          const eMs = +new Date(end);
          if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) return;
          preciseByContentDay.set(`${contentId}|${day}`, {
            startIso: new Date(sMs).toISOString(),
            endIso: new Date(eMs).toISOString(),
          });
        };

        for (const r of feedbackRows as any[]) {
          const contentId = String(r.content_id ?? '');
          const day = String((r.context_data as any)?.local_date || r.created_at || '').slice(0, 10);
          const ctx = (r.context_data ?? {}) as any;
          setPrecise(
            contentId,
            day,
            ctx.practice_started_at ?? ctx.practiceStartedAt,
            ctx.practice_completed_at ?? ctx.practiceCompletedAt,
          );
        }

        for (const row of (drcRes.data ?? []) as any[]) {
          const day = String(row.ritual_date ?? '').slice(0, 10);
          if (!day) continue;
          const ids = ((row.completed_practice_ids ?? []) as string[]).filter(Boolean);
          if (ids.length !== 1) continue;
          const s = row.practice_started_at;
          const e = row.practice_completed_at;
          setPrecise(ids[0], day, s, e);
        }

        type Completion = {
          content_id: string;
          timestamp: string | null;
          /** End of the measured session when the client recorded it. */
          endTimestamp: string | null;
          /** Earliest post-practice rating for this (practice, day), if any. */
          ratingMs: number | null;
          day: string;
        };
        const completionKeys = new Set<string>();
        const completedEvents: Completion[] = [];
        const pushCompletion = (contentId: string, day: string, fallbackIso: string | null) => {
          const key = `${contentId}|${day}`;
          if (completionKeys.has(key)) return;
          completionKeys.add(key);
          const precise = preciseByContentDay.get(key);
          const anchor = ratingAnchors.get(key);
          // Precise client timings win; then the earliest rating; then the slot stamp.
          const iso = precise?.startIso ?? (anchor != null ? new Date(anchor).toISOString() : fallbackIso);
          completedEvents.push({
            content_id: contentId,
            timestamp: iso,
            endTimestamp: precise?.endIso ?? null,
            ratingMs: anchor ?? null,
            day,
          });
        };

        for (const row of (drcRes.data ?? []) as any[]) {
          const day = String(row.ritual_date ?? '').slice(0, 10);
          if (!day) continue;
          const slotIso: string | null =
            row.guided_practice_completed_at ||
            row.micro_exercise_completed_at ||
            row.soundscape_completed_at ||
            null;
          for (const id of (row.completed_practice_ids ?? []) as string[]) {
            if (id) pushCompletion(id, day, slotIso);
          }
        }
        // Freshly rated practices with no ritual-completion row still count.
        for (const r of feedbackRows) {
          if (!r.content_id || !r.created_at) continue;
          if (r.created_at < sessionSinceIso) continue;
          pushCompletion(r.content_id, r.created_at.slice(0, 10), r.created_at);
        }

        const totalPractices = completedEvents.length;

        // ── Content metadata (needed for duration + canonical category) ──
        const completionIds = Array.from(new Set(completedEvents.map((e) => e.content_id)))
          .filter((id) => !id.startsWith('plan-'));
        const { data: contentData } = completionIds.length
          ? await supabase
              .from('sanctuary_content')
              .select('id, title, category, duration')
              .in('id', completionIds)
          : { data: [] as any[] };
        const contentMap = new Map((contentData ?? []).map((c: any) => [c.id, c]));

        // sanctuary_content.category holds pause / presence / power-up.
        const canonicalCategory = (raw: string | null | undefined): string => {
          const c = (raw || '').toLowerCase();
          if (c.includes('pause')) return 'Pause';
          if (c.includes('presence') || c.includes('flow')) return 'Flow';
          if (c.includes('power') || c.includes('energi')) return 'Energise';
          return 'Unknown';
        };
        const durationSecondsOf = (contentId: string): number => {
          const raw = Number((contentMap.get(contentId) as any)?.duration);
          if (!Number.isFinite(raw) || raw <= 0) return 20 * 60;
          // `duration` is authored in minutes (e.g. 1.5, 3, 12).
          return Math.round(raw <= 180 ? raw * 60 : raw);
        };


        // ── Helpers ─────────────────────────────────────────────
        const windowOf = (iso: string): 'morning' | 'afternoon' | 'evening' => {
          const h = new Date(iso).getUTCHours(); // server-side approximation
          if (h >= 5 && h < 12) return 'morning';
          if (h >= 12 && h < 18) return 'afternoon';
          return 'evening';
        };
        const dateKey = (iso: string) => iso.slice(0, 10);
        const nextDateKey = (iso: string) => {
          const d = new Date(iso);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        };

        // Map wearable by date
        const wearableByDate = new Map<string, { hrv: number | null; rhr: number | null }>();
        // Intraday HR samples indexed by summary_date → sorted [ms, bpm] pairs
        const hrSamplesByDate = new Map<string, Array<{ t: number; v: number }>>();
        for (const w of wearable) {
          wearableByDate.set(w.summary_date, { hrv: w.hrv, rhr: w.resting_heart_rate });
          const raw = Array.isArray(w.hr_samples) ? (w.hr_samples as any[]) : [];
          const parsed: Array<{ t: number; v: number }> = [];
          for (const s of raw) {
            const t = s?.t ? +new Date(s.t) : NaN;
            const v = typeof s?.v === 'number' ? s.v : Number(s?.v);
            if (Number.isFinite(t) && Number.isFinite(v) && v > 0) parsed.push({ t, v });
          }
          parsed.sort((a, b) => a.t - b.t);
          hrSamplesByDate.set(w.summary_date, parsed);
        }

        const median = (vals: number[]): number | null => {
          if (!vals.length) return null;
          const s = [...vals].sort((a, b) => a - b);
          const mid = Math.floor(s.length / 2);
          return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        };

        // Tier 2 basis: the user's own median HR per hour-of-day block over the
        // trailing 30 days. Lets us score a practice even when the pre/post
        // windows are empty, as long as we have HR *during* it.
        const hourBaselineCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const hourBuckets: number[][] = Array.from({ length: 24 }, () => []);
        for (const samples of hrSamplesByDate.values()) {
          for (const s of samples) {
            if (s.t < hourBaselineCutoff) continue;
            hourBuckets[new Date(s.t).getUTCHours()].push(s.v);
          }
        }
        const hourBaselines = hourBuckets.map((vals) => (vals.length >= 10 ? median(vals) : null));

        // Tier 3 basis: 30-day rolling median HRV.
        const hrvBaseline = (() => {
          const cutoffDate = new Date(hourBaselineCutoff).toISOString().slice(0, 10);
          const vals: number[] = [];
          for (const w of wearable) {
            if (w.summary_date < cutoffDate) continue;
            if (typeof w.hrv === 'number' && w.hrv > 0) vals.push(w.hrv);
          }
          return vals.length >= 5 ? median(vals) : null;
        })();



        /**
         * Mean HR across [fromMs, toMs). Samples are stored per summary_date, so a
         * window that crosses midnight has to consult both day buckets.
         */
        const meanHrBetween = (
          fromMs: number,
          toMs: number,
          opts?: { includeEnd?: boolean; excludeStart?: boolean },
        ): { mean: number | null; n: number } => {
          if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
            return { mean: null, n: 0 };
          }
          // Providers file late-evening samples under the *following* summary_date,
          // so scan the neighbouring buckets as well as the spanned days.
          const keys = new Set<string>();
          for (const anchor of [fromMs, toMs]) {
            for (const offset of [-1, 0, 1]) {
              keys.add(new Date(anchor + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
            }
          }

          let sum = 0;
          let n = 0;
          for (const k of keys) {
            for (const s of hrSamplesByDate.get(k) ?? []) {
              const afterStart = opts?.excludeStart ? s.t > fromMs : s.t >= fromMs;
              const beforeEnd = opts?.includeEnd ? s.t <= toMs : s.t < toMs;
              if (afterStart && beforeEnd) {
                sum += s.v;
                n += 1;
              }
            }
          }
          if (n < 2) return { mean: null, n };
          return { mean: sum / n, n };
        };

        const round1 = (v: number) => Math.round(v * 10) / 10;

        // Sort check-ins ascending and index by epoch ms
        const sortedCheckins = checkins
          .filter((c) => c.timestamp)
          .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

        // Bounded pairing: a check-in only counts as "before"/"after" a practice
        // when it sits inside the window where the practice could plausibly matter.
        const BEFORE_WINDOW_MS = 60 * 60 * 1000;
        const AFTER_WINDOW_MS = 90 * 60 * 1000;
        const findNextCheckin = (afterIso: string) => {
          const t = +new Date(afterIso);
          for (const c of sortedCheckins) {
            const ct = +new Date(c.timestamp);
            if (ct > t && ct <= t + AFTER_WINDOW_MS) return c;
            if (ct > t + AFTER_WINDOW_MS) return null;
          }
          return null;
        };
        const findPriorCheckin = (beforeIso: string) => {
          const t = +new Date(beforeIso);
          let last = null as (typeof sortedCheckins)[number] | null;
          for (const c of sortedCheckins) {
            const ct = +new Date(c.timestamp);
            if (ct < t) {
              if (ct >= t - BEFORE_WINDOW_MS) last = c;
            } else break;
          }
          return last;
        };

        // Composite of clarity/sharpness/confidence on 0..100 scale (input 1..10)
        const composite = (c: { clarity_level: number | null; mental_sharpness_level: number | null; confidence_level: number | null } | null | undefined): number | null => {
          if (!c) return null;
          const vals = [c.clarity_level, c.mental_sharpness_level, c.confidence_level].filter((v): v is number => typeof v === 'number');
          if (!vals.length) return null;
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          return Math.round((mean / 10) * 100);
        };

        // ── Per-practice aggregation ────────────────────────────
        type PracticeAgg = {
          contentId: string;
          sessions: number;
          thumbsUp: number;
          thumbsDown: number;
          deltaSum: number;
          deltaCount: number;
          isPlan: boolean;
        };
        const perContent = new Map<string, PracticeAgg>();
        const getAgg = (id: string, isPlan: boolean): PracticeAgg => {
          let a = perContent.get(id);
          if (!a) {
            a = { contentId: id, sessions: 0, thumbsUp: 0, thumbsDown: 0, deltaSum: 0, deltaCount: 0, isPlan };
            perContent.set(id, a);
          }
          return a;
        };

        // Per-window and per-day-of-week aggregation for Box 2
        const windowAgg = {
          morning: { sum: 0, n: 0 },
          afternoon: { sum: 0, n: 0 },
          evening: { sum: 0, n: 0 },
        };
        const dowAgg: Array<{ sum: number; n: number }> = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));

        // Per-dim before/after for Box 3 (cognitive)
        const dimAgg = {
          clarity:    { before: 0, after: 0, n: 0 },
          sharpness:  { before: 0, after: 0, n: 0 },
          confidence: { before: 0, after: 0, n: 0 },
        };
        // Wearable next-AM lift
        const wearableAgg = {
          hrv: { before: 0, after: 0, n: 0 },
          rhr: { before: 0, after: 0, n: 0 },
        };

        // Category-aware per-practice wearable signal accumulator
        type WearableSignalAgg = {
          hrBeforeSum: number; hrDuringSum: number; hrAfterSum: number; hrN: number;
          hrvBeforeSum: number; hrvAfterSum: number; hrvN: number;
          /** Tier 2 — HR during vs the user's own hour-of-day baseline. */
          baseDuringSum: number; baseExpectedSum: number; baseN: number;
          /** Tier 3 — next-morning HRV vs the 30-day median. */
          hrvNextSum: number; hrvBaseSum: number; hrvBaseN: number;
          /** True when any contributing window came from rating-derived timing. */
          ratingDerived: boolean;
        };
        const wearableSignalAgg = new Map<string, WearableSignalAgg>();
        const getSignalAgg = (id: string): WearableSignalAgg => {
          let a = wearableSignalAgg.get(id);
          if (!a) {
            a = {
              hrBeforeSum: 0, hrDuringSum: 0, hrAfterSum: 0, hrN: 0,
              hrvBeforeSum: 0, hrvAfterSum: 0, hrvN: 0,
              baseDuringSum: 0, baseExpectedSum: 0, baseN: 0,
              hrvNextSum: 0, hrvBaseSum: 0, hrvBaseN: 0,
              ratingDerived: false,
            };
            wearableSignalAgg.set(id, a);
          }
          return a;
        };

        // Which A–H day type each practice tends to precede
        const eventCategoryAgg = new Map<string, Map<string, number>>();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const calendarByDay = new Map<string, typeof calendarEvents>();
        for (const ce of calendarEvents) {
          if (!ce.start_time) continue;
          const k = dateKey(ce.start_time);
          const list = calendarByDay.get(k) ?? [];
          list.push(ce);
          calendarByDay.set(k, list);
        }
        const dayTypeCache = new Map<string, string>();
        const dayTypeFor = (dayKey: string): string | null => {
          if (dayTypeCache.has(dayKey)) return dayTypeCache.get(dayKey)!;
          const events = calendarByDay.get(dayKey) ?? [];
          if (!events.length) return null;
          const loadMinutes = events.reduce((a, e) => a + durationMinutesOf(e), 0);
          const label = classifyDominantDayType(events, loadMinutes).dayType;
          dayTypeCache.set(dayKey, label);
          return label;
        };

        for (const ev of completedEvents) {
          const a = getAgg(ev.content_id, ev.content_id.startsWith('plan-'));
          a.sessions += 1;
          // No timestamp anchor → counts as a session, contributes no signal.
          if (!ev.timestamp) continue;

          const next = findNextCheckin(ev.timestamp);
          const prior = findPriorCheckin(ev.timestamp);
          const after = composite(next);
          const before = composite(prior);
          if (after != null && before != null) {
            const delta = after - before;
            a.deltaSum += delta;
            a.deltaCount += 1;

            const w = windowOf(ev.timestamp);
            windowAgg[w].sum += after;
            windowAgg[w].n += 1;
            const dow = dayOfWeekFromIsoDate(dateKey(ev.timestamp));
            dowAgg[dow].sum += after;
            dowAgg[dow].n += 1;

            // Per-dim averages (next vs prior)
            const pushDim = (key: 'clarity' | 'sharpness' | 'confidence', priorV: number | null, nextV: number | null) => {
              if (priorV != null && nextV != null) {
                dimAgg[key].before += (priorV / 10) * 100;
                dimAgg[key].after += (nextV / 10) * 100;
                dimAgg[key].n += 1;
              }
            };
            pushDim('clarity', prior?.clarity_level ?? null, next?.clarity_level ?? null);
            pushDim('sharpness', prior?.mental_sharpness_level ?? null, next?.mental_sharpness_level ?? null);
            pushDim('confidence', prior?.confidence_level ?? null, next?.confidence_level ?? null);
          }

          // ── Wearable signal, three tiers ──────────────────────
          // Tier 1 BEFORE [start−15m, start), DURING [start, end),
          // AFTER (end, end+15m] — all three required.
          // Tier 2 DURING vs the user's own hour-of-day HR baseline.
          // Tier 3 next-morning HRV vs the 30-day median HRV.
          const anchorMs = +new Date(ev.timestamp);
          if (Number.isFinite(anchorMs)) {
            const durationMs = durationSecondsOf(ev.content_id) * 1000;
            const preciseEndMs = ev.endTimestamp ? +new Date(ev.endTimestamp) : NaN;
            const hasPreciseEnd = Number.isFinite(preciseEndMs) && preciseEndMs > anchorMs;
            // Without precise timing, a rating stamps the *end* of the practice.
            const ratingDerived = !hasPreciseEnd && ev.ratingMs != null;
            const startMs = ratingDerived ? (ev.ratingMs as number) - durationMs : anchorMs;
            const endMs = hasPreciseEnd
              ? preciseEndMs
              : ratingDerived
                ? (ev.ratingMs as number)
                : anchorMs + durationMs;

            const hrBefore = meanHrBetween(startMs - 15 * 60 * 1000, startMs);
            const hrDuring = meanHrBetween(startMs, endMs);
            const hrAfter = meanHrBetween(endMs, endMs + 15 * 60 * 1000, { excludeStart: true, includeEnd: true });
            const sig = getSignalAgg(ev.content_id);
            if (ratingDerived) sig.ratingDerived = true;

            // Confound guard — a pre-practice HR above 100 bpm means the user was
            // active, not at rest. The session contributes to no HR aggregate.
            const confounded = hrBefore.mean != null && hrBefore.mean > 100;
            if (confounded) {
              // skip HR aggregation entirely for this session
            } else if (hrBefore.mean != null && hrDuring.mean != null && hrAfter.mean != null) {
              // Tier 1
              sig.hrBeforeSum += hrBefore.mean;
              sig.hrDuringSum += hrDuring.mean;
              sig.hrAfterSum += hrAfter.mean;
              sig.hrN += 1;
            } else if (hrDuring.mean != null) {
              // Tier 2 — personal time-of-day baseline
              const expected = hourBaselines[new Date(startMs).getUTCHours()];
              if (expected != null && expected > 0) {
                sig.baseDuringSum += hrDuring.mean;
                sig.baseExpectedSum += expected;
                sig.baseN += 1;
              }
            }

            // Overnight recovery: HRV on the practice day vs the next morning.
            // RHR is deliberately not used — same granularity, same construct.
            const d0 = wearableByDate.get(dateKey(ev.timestamp));
            const d1 = wearableByDate.get(nextDateKey(ev.timestamp));
            if (d0?.hrv != null && d1?.hrv != null) {
              sig.hrvBeforeSum += d0.hrv;
              sig.hrvAfterSum += d1.hrv;
              sig.hrvN += 1;
            }
            // Tier 3 — next-morning HRV vs 30-day median (works with one night)
            if (d1?.hrv != null && hrvBaseline != null && hrvBaseline > 0) {
              sig.hrvNextSum += d1.hrv;
              sig.hrvBaseSum += hrvBaseline;
              sig.hrvBaseN += 1;
            }


            // Event category this practice preceded (calendar event within 24h after)
            const followers = calendarEvents.filter((ce) => {
              if (!ce.start_time) return false;
              const s = +new Date(ce.start_time);
              return Number.isFinite(s) && s > startMs && s <= startMs + DAY_MS;
            });
            if (followers.length) {
              const dayKeys = new Set(followers.map((ce) => dateKey(ce.start_time as string)));
              const tally = eventCategoryAgg.get(ev.content_id) ?? new Map<string, number>();
              for (const k of dayKeys) {
                const label = dayTypeFor(k);
                if (!label) continue;
                tally.set(label, (tally.get(label) ?? 0) + 1);
              }
              if (tally.size) eventCategoryAgg.set(ev.content_id, tally);
            }
          }

          // Wearable next-AM lift: AM session → compare D vs D+1
          if (windowOf(ev.timestamp) === 'morning') {
            const d0 = dateKey(ev.timestamp);
            const d1 = nextDateKey(ev.timestamp);
            const before0 = wearableByDate.get(d0);
            const after0 = wearableByDate.get(d1);
            if (before0 && after0) {
              if (before0.hrv != null && after0.hrv != null) {
                wearableAgg.hrv.before += before0.hrv;
                wearableAgg.hrv.after += after0.hrv;
                wearableAgg.hrv.n += 1;
              }
              if (before0.rhr != null && after0.rhr != null) {
                wearableAgg.rhr.before += before0.rhr;
                wearableAgg.rhr.after += after0.rhr;
                wearableAgg.rhr.n += 1;
              }
            }
          }
        }

        // Thumbs attribution per content_id. Thumbs-up writes 5, thumbs-down
        // writes 1. Neutral (3) is excluded from numerator and denominator.
        for (const r of feedbackRows) {
          if (!r.content_id || r.star_rating == null) continue;
          if (r.star_rating === 3) continue;
          const a = getAgg(r.content_id, r.content_id.startsWith('plan-'));
          if (r.star_rating > 3) a.thumbsUp += 1;
          else a.thumbsDown += 1;
        }


        // ── Top up content metadata for rating-only ids ─────────
        const missingIds = Array.from(perContent.keys()).filter(
          (id) => !id.startsWith('plan-') && !contentMap.has(id),
        );
        if (missingIds.length) {
          const { data: extra } = await supabase
            .from('sanctuary_content')
            .select('id, title, category, duration')
            .in('id', missingIds);
          for (const c of (extra ?? []) as any[]) contentMap.set(c.id, c);
        }
        // Legacy fallback map (sanctuary_events categories) — retired source.
        const eventCategoryMap = new Map<string, string>();


        // ── Category-aware wearable signal per practice ─────────
        type WearableSignal = {
          primarySignalPct: number | null;
          primarySignalLabel: string;
          primarySignalIsPositive: boolean;
          secondarySignalPct: number | null;
          secondarySignalLabel: string;
          n: number;
          signalTier: 'triple_window' | 'baseline_comparison' | 'hrv_next_day' | null;
          timingSource: 'precise' | 'rating_derived';
        };
        const usableSignal = (s: WearableSignal | null): WearableSignal | null => {
          if (!s) return null;
          if (s.n < 1) return null;
          if (s.primarySignalPct == null && s.secondarySignalPct == null) return null;
          return s;
        };
        const buildWearableSignal = (contentId: string, category: string): WearableSignal | null => {
          const agg = wearableSignalAgg.get(contentId);
          if (!agg) return null;
          const cat = (category || '').toLowerCase();
          const hasHr = agg.hrN >= 1;
          const hasHrv = agg.hrvN >= 1;
          const hasBaseline = agg.baseN >= 1 && agg.baseExpectedSum > 0;
          const hasHrvBaseline = agg.hrvBaseN >= 1 && agg.hrvBaseSum > 0;
          const timingSource: 'precise' | 'rating_derived' = agg.ratingDerived ? 'rating_derived' : 'precise';
          if (!hasHr && !hasHrv && !hasBaseline && !hasHrvBaseline) return null;

          const meanHrBefore = hasHr ? agg.hrBeforeSum / agg.hrN : null;
          const meanHrDuring = hasHr ? agg.hrDuringSum / agg.hrN : null;
          const meanHrAfter = hasHr ? agg.hrAfterSum / agg.hrN : null;
          const hrDropPct = meanHrBefore && meanHrDuring
            ? round1(((meanHrBefore - meanHrDuring) / meanHrBefore) * 100)
            : null;
          const hrRisePct = meanHrBefore && meanHrDuring
            ? round1(((meanHrDuring - meanHrBefore) / meanHrBefore) * 100)
            : null;
          const hrRecoveryPct = meanHrDuring && meanHrAfter
            ? round1(((meanHrDuring - meanHrAfter) / meanHrDuring) * 100)
            : null;
          const hrvLiftPct = hasHrv && agg.hrvBeforeSum > 0
            ? round1((((agg.hrvAfterSum / agg.hrvN) - (agg.hrvBeforeSum / agg.hrvN)) / (agg.hrvBeforeSum / agg.hrvN)) * 100)
            : null;

          // ── Tier 1 — precise triple window ────────────────────
          if (hasHr) {
            const base = { signalTier: 'triple_window' as const, timingSource };
            if (cat.includes('pause')) {
              return {
                primarySignalPct: hrDropPct,
                primarySignalLabel: 'HR during',
                primarySignalIsPositive: false,
                secondarySignalPct: null,
                secondarySignalLabel: '',
                n: agg.hrN,
                ...base,
              };
            }
            if (cat.includes('flow')) {
              return {
                primarySignalPct: hrvLiftPct ?? hrDropPct,
                primarySignalLabel: hrvLiftPct != null ? 'HRV next AM' : 'HR during',
                primarySignalIsPositive: hrvLiftPct != null,
                secondarySignalPct: hrvLiftPct != null ? hrDropPct : null,
                secondarySignalLabel: hrvLiftPct != null ? 'HR during' : '',
                n: hasHrv ? agg.hrvN : agg.hrN,
                ...base,
              };
            }
            if (cat.includes('energise') || cat.includes('energize')) {
              return {
                primarySignalPct: hrRisePct,
                primarySignalLabel: 'HR during',
                primarySignalIsPositive: true,
                secondarySignalPct: hrRecoveryPct,
                secondarySignalLabel: 'HR recovered',
                n: agg.hrN,
                ...base,
              };
            }
            return {
              primarySignalPct: hrDropPct,
              primarySignalLabel: 'HR during',
              primarySignalIsPositive: false,
              secondarySignalPct: null,
              secondarySignalLabel: '',
              n: agg.hrN,
              ...base,
            };
          }

          // ── Tier 2 — HR during vs personal hour-of-day baseline ──
          if (hasBaseline) {
            const expected = agg.baseExpectedSum / agg.baseN;
            const during = agg.baseDuringSum / agg.baseN;
            const dropPct = round1(((expected - during) / expected) * 100);
            const energising = cat.includes('energise') || cat.includes('energize');
            return {
              primarySignalPct: energising ? round1(-dropPct) : dropPct,
              primarySignalLabel: 'HR vs baseline',
              primarySignalIsPositive: energising,
              secondarySignalPct: null,
              secondarySignalLabel: '',
              n: agg.baseN,
              signalTier: 'baseline_comparison',
              timingSource,
            };
          }

          // ── Tier 3 — next-morning HRV vs 30-day median ──────────
          if (hasHrvBaseline) {
            const base = agg.hrvBaseSum / agg.hrvBaseN;
            const next = agg.hrvNextSum / agg.hrvBaseN;
            return {
              primarySignalPct: round1(((next - base) / base) * 100),
              primarySignalLabel: 'HRV vs baseline',
              primarySignalIsPositive: true,
              secondarySignalPct: null,
              secondarySignalLabel: '',
              n: agg.hrvBaseN,
              signalTier: 'hrv_next_day',
              timingSource,
            };
          }

          // Day-over-day HRV pair without a usable baseline.
          if (hasHrv && hrvLiftPct != null) {
            return {
              primarySignalPct: hrvLiftPct,
              primarySignalLabel: 'HRV next AM',
              primarySignalIsPositive: true,
              secondarySignalPct: null,
              secondarySignalLabel: '',
              n: agg.hrvN,
              signalTier: 'hrv_next_day',
              timingSource,
            };
          }
          return null;
        };

        // ── Backfill timing context onto existing ratings ────────
        // Historic ratings were written without timing, so reads had nothing to
        // anchor wearable windows to. Repair them from the ritual ledger, for
        // this user only, and never overwrite an existing context_data payload.
        try {
          type DrcTiming = { startIso: string; endIso: string; ids: string[] };
          const drcTimingByDay = new Map<string, DrcTiming[]>();
          for (const row of (drcRes.data ?? []) as any[]) {
            const day = String(row.ritual_date ?? '').slice(0, 10);
            const s = row.practice_started_at;
            const e = row.practice_completed_at;
            if (!day || typeof s !== 'string' || typeof e !== 'string') continue;
            const sMs = +new Date(s);
            const eMs = +new Date(e);
            if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) continue;
            const ids = ((row.completed_practice_ids ?? []) as string[]).filter(Boolean);
            const list = drcTimingByDay.get(day) ?? [];
            list.push({ startIso: new Date(sMs).toISOString(), endIso: new Date(eMs).toISOString(), ids });
            drcTimingByDay.set(day, list);
          }

          const backfills: Array<{ id: string; context_data: Record<string, unknown> }> = [];
          for (const r of feedbackRows as any[]) {
            if (!r.id || !r.content_id || !r.created_at) continue;
            if (r.context_data != null) continue;
            const day = String(r.created_at).slice(0, 10);
            const match = (drcTimingByDay.get(day) ?? []).find((t) => t.ids.includes(r.content_id));
            if (!match) continue;
            const durationSeconds = Math.round((+new Date(match.endIso) - +new Date(match.startIso)) / 1000);
            backfills.push({
              id: r.id,
              context_data: {
                practiceStartedAt: match.startIso,
                practiceCompletedAt: match.endIso,
                durationSeconds,
                backfilled: true,
              },
            });
          }

          for (const b of backfills.slice(0, 200)) {
            const { error } = await supabase
              .from('content_relevance_feedback')
              .update({ context_data: b.context_data })
              .eq('id', b.id)
              .eq('user_id', userId)
              .is('context_data', null);
            if (error) console.warn('[content-feedback] context_data backfill failed', b.id, error.message);
          }
          if (backfills.length) {
            console.log(`[content-feedback] backfilled context_data on ${Math.min(backfills.length, 200)} rating(s)`);
          }
        } catch (e) {
          console.warn('[content-feedback] context_data backfill skipped:', (e as Error)?.message);
        }

        // ── Box 1 list (composite scoring) ──────────────────────
        const box1Practices = Array.from(perContent.values())
          // Synthetic plan-level rows (plan-tod/plan-*) are attribution carriers, not
          // practices — real practices in a slot are recorded individually.
          .filter((a) => !a.isPlan)
          .filter((a) => a.sessions > 0 || a.thumbsUp + a.thumbsDown > 0)

          .map((a) => {
            const meta = contentMap.get(a.contentId) as any;
            const isFav = favouriteIds.has(a.contentId);
            const category = canonicalCategory(meta?.category);
            // Average delta normalised to 0..100 around 50 baseline
            const avgDelta = a.deltaCount > 0 ? a.deltaSum / a.deltaCount : 0;
            const baseScore = Math.max(0, Math.min(100, 50 + avgDelta));
            const thumbsTotal = a.thumbsUp + a.thumbsDown;
            const thumbsRate = thumbsTotal > 0 ? a.thumbsUp / thumbsTotal : null;
            const thumbsBoost = thumbsRate != null ? (thumbsRate - 0.5) * 20 : 0;
            const favBoost = isFav ? 1.1 : 1.0;
            const composite = Math.max(0, Math.min(100, baseScore * favBoost + thumbsBoost));
            const tally = eventCategoryAgg.get(a.contentId);
            const dominantEventCategory = tally && tally.size
              ? [...tally.entries()].sort((x, y) => y[1] - x[1])[0][0]
              : null;
            const wearableSignal = usableSignal(buildWearableSignal(a.contentId, category));
            return {
              contentId: a.contentId,
              title:
                meta?.title ||
                (a.isPlan ? 'Daily plan' : eventCategoryMap.get(a.contentId) || 'Practice'),
              category,
              sessions: a.sessions,
              thumbsUp: a.thumbsUp,
              thumbsTotal,
              thumbsRate: thumbsRate != null ? Math.round(thumbsRate * 100) / 100 : null,
              compositeScore: Math.round(composite),
              isFavourite: isFav,
              planBadge: a.isPlan ? 'Daily plan' : null,
              wearableSignal,
              signalTier: wearableSignal?.signalTier ?? null,
              dominantEventCategory,
            };
          })
          .sort((a, b) => b.compositeScore - a.compositeScore);

        // Back-compat topPractice (highest composite with at least 1 session)
        const topRow = box1Practices.find((p) => p.sessions > 0) || box1Practices[0] || null;
        const topPractice = topRow
          ? {
              contentId: topRow.contentId,
              title: topRow.title,
              category: topRow.category,
              timesUsed: topRow.sessions || topRow.thumbsTotal,
              avgRating: topRow.thumbsRate != null ? topRow.thumbsRate * 5 : 0,
            }
          : null;

        // ── Section 2 — Before Your Hardest Days ────────────────
        type Section2Entry = {
          eventType: string;
          practicesUsed: string[];
          hrDeltaPct: number | null;
          hrDeltaN: number;
          postEventRating: null;
          postEventRatingN: number;
        };
        const practiceTitleOf = (contentId: string): string => {
          const meta = contentMap.get(contentId) as any;
          return meta?.title || eventCategoryMap.get(contentId) || 'Practice';
        };
        const practiceStarts = completedEvents
          .filter((e) => !!e.timestamp)
          .map((e) => ({ id: e.content_id, t: +new Date(e.timestamp as string) }))
          .filter((e) => Number.isFinite(e.t));


        // Overall mean HR across every calendar event window (fallback baseline)
        let overallSum = 0;
        let overallN = 0;
        for (const ce of calendarEvents) {
          if (!ce.start_time || !ce.end_time) continue;
          const m = meanHrBetween(+new Date(ce.start_time), +new Date(ce.end_time));
          if (m.mean != null) { overallSum += m.mean; overallN += 1; }
        }
        const overallMeanHr = overallN >= 2 ? overallSum / overallN : null;

        const targetTypes = new Set(
          box1Practices.map((p) => p.dominantEventCategory).filter((v): v is string => !!v),
        );
        const section2: Section2Entry[] = [];
        for (const eventType of targetTypes) {
          const withHr: number[] = [];
          const withoutHr: number[] = [];
          const practiceCounts = new Map<string, number>();
          for (const ce of calendarEvents) {
            if (!ce.start_time) continue;
            const dayKey = dateKey(ce.start_time);
            if (dayTypeFor(dayKey) !== eventType) continue;
            const startMs = +new Date(ce.start_time);
            const priorPractices = practiceStarts.filter(
              (p) => p.t < startMs && p.t >= startMs - DAY_MS,
            );
            const endMs = ce.end_time ? +new Date(ce.end_time) : startMs + 60 * 60 * 1000;
            const m = meanHrBetween(startMs, endMs);
            if (priorPractices.length) {
              for (const p of priorPractices) {
                const title = practiceTitleOf(p.id);
                practiceCounts.set(title, (practiceCounts.get(title) ?? 0) + 1);
              }
              if (m.mean != null) withHr.push(m.mean);
            } else if (m.mean != null) {
              withoutHr.push(m.mean);
            }
          }
          const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
          const withMean = meanOf(withHr);
          const withoutMean = meanOf(withoutHr);
          let hrDeltaPct: number | null = null;
          if (withMean != null && withoutMean != null && withoutMean > 0) {
            hrDeltaPct = round1(((withoutMean - withMean) / withoutMean) * 100);
          } else if (withMean != null && withHr.length >= 2 && overallMeanHr != null && overallMeanHr > 0) {
            hrDeltaPct = round1(((overallMeanHr - withMean) / overallMeanHr) * 100);
          }
          const practicesUsed = [...practiceCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([title]) => title);
          const hrDeltaN = withHr.length;
          if (hrDeltaN >= 1) {
            section2.push({
              eventType,
              practicesUsed,
              hrDeltaPct,
              hrDeltaN,
              postEventRating: null,
              postEventRatingN: 0,
            });
          }
        }
        section2.sort((a, b) => b.hrDeltaN - a.hrDeltaN);

        // ── Box 2 ───────────────────────────────────────────────
        const meanOr0 = (s: { sum: number; n: number }) => (s.n > 0 ? Math.round(s.sum / s.n) : 0);
        const byWindow = {
          morning:   { score: meanOr0(windowAgg.morning),   n: windowAgg.morning.n },
          afternoon: { score: meanOr0(windowAgg.afternoon), n: windowAgg.afternoon.n },
          evening:   { score: meanOr0(windowAgg.evening),   n: windowAgg.evening.n },
        };
        const bestWin = (['morning', 'afternoon', 'evening'] as const).reduce((best, w) =>
          byWindow[w].score > byWindow[best].score ? w : best, 'morning' as const);
        const byDayOfWeek = dowAgg.map((s, dow) => ({ dow, score: meanOr0(s), n: s.n }));

        // ── Box 3 ───────────────────────────────────────────────
        const dimNorm = (d: { before: number; after: number; n: number }) =>
          d.n > 0
            ? { before: Math.round(d.before / d.n), after: Math.round(d.after / d.n), n: d.n }
            : { before: 0, after: 0, n: 0 };
        const wearableNorm = (d: { before: number; after: number; n: number }) =>
          d.n > 0
            ? { before: Math.round((d.before / d.n) * 10) / 10, after: Math.round((d.after / d.n) * 10) / 10, n: d.n }
            : { before: 0, after: 0, n: 0 };
        const lift = (b: number, a: number, inverse = false) =>
          b === 0 ? 0 : Math.round(((inverse ? b - a : a - b) / b) * 100);

        const c = dimNorm(dimAgg.clarity);
        const s = dimNorm(dimAgg.sharpness);
        const cf = dimNorm(dimAgg.confidence);
        const hv = wearableNorm(wearableAgg.hrv);
        const rh = wearableNorm(wearableAgg.rhr);

        const dims = [
          { label: 'Clarity',       before: c.before,  after: c.after,  lift: lift(c.before, c.after),       n: c.n },
          { label: 'Sharpness',     before: s.before,  after: s.after,  lift: lift(s.before, s.after),       n: s.n },
          { label: 'Confidence',    before: cf.before, after: cf.after, lift: lift(cf.before, cf.after),     n: cf.n },
          { label: 'HRV (next AM)', before: hv.before, after: hv.after, lift: lift(hv.before, hv.after),     n: hv.n },
          { label: 'RHR (next AM)', before: rh.before, after: rh.after, lift: lift(rh.before, rh.after, true), n: rh.n, inverse: true },
        ];

        // ── Stage ───────────────────────────────────────────────
        const stage =
          totalPractices < 3 ? 'early' : totalPractices < 10 ? 'building' : 'deepening';

        return new Response(
          JSON.stringify({
            data: {
              topPractice,
              totalPractices,
              stage,
              windowDays: 30,
              box1: { practices: box1Practices },
              box2: { byWindow, byDayOfWeek, best: bestWin },
              box3: { dims },
              section2,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[content-feedback] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
