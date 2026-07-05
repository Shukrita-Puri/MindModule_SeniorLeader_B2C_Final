import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_FEEDBACK' | 'SUBMIT_FEEDBACK' | 'UPDATE_SESSION_RATING' | 'GET_PRACTICE_IMPACT';
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
        // 30-day window
        const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        // ── Pull all source data in parallel ─────────────────────
        const [fbRes, evRes, ciRes, wdRes, favRes] = await Promise.all([
          supabase
            .from('content_relevance_feedback')
            .select('content_id, content_type, star_rating, session_id, trigger_context, created_at')
            .eq('user_id', userId)
            .eq('feedback_type', 'star_rating')
            .not('star_rating', 'is', null)
            .gte('created_at', sinceIso),
          supabase
            .from('sanctuary_events')
            .select('content_id, category, timestamp')
            .eq('user_id', userId)
            .in('event_type', ['completed', 'session_complete'])
            .gte('timestamp', sinceIso),
          supabase
            .from('daily_checkins')
            .select('checkin_date, time_window, timestamp, clarity_level, mental_sharpness_level, confidence_level')
            .eq('user_id', userId)
            .gte('checkin_date', sinceDate)
            .order('timestamp', { ascending: true }),
          supabase
            .from('wearable_data')
            .select('summary_date, hrv, resting_heart_rate')
            .eq('user_id', userId)
            .gte('summary_date', sinceDate),
          supabase
            .from('user_favorites')
            .select('content_id'),
        ]);

        if (fbRes.error) throw fbRes.error;
        if (evRes.error) throw evRes.error;
        if (ciRes.error) throw ciRes.error;
        if (wdRes.error) throw wdRes.error;

        const feedbackRows = (fbRes.data ?? []).filter(
          (r: any) =>
            !r.trigger_context ||
            r.trigger_context === 'post_practice_completion' ||
            r.trigger_context === 'post_plan_completion'
        );
        const completedEvents = (evRes.data ?? []) as Array<{
          content_id: string; category: string; timestamp: string;
        }>;
        const checkins = (ciRes.data ?? []) as Array<{
          checkin_date: string; time_window: string | null; timestamp: string;
          clarity_level: number | null; mental_sharpness_level: number | null;
          confidence_level: number | null;
        }>;
        const wearable = (wdRes.data ?? []) as Array<{
          summary_date: string; hrv: number | null; resting_heart_rate: number | null;
        }>;
        const favouriteIds = new Set((favRes.data ?? []).map((f: any) => f.content_id));

        const totalPractices = completedEvents.length;

        // ── Helpers ─────────────────────────────────────────────
        const windowOf = (iso: string): 'morning' | 'afternoon' | 'evening' => {
          const h = new Date(iso).getUTCHours(); // server-side approximation
          if (h >= 5 && h < 12) return 'morning';
          if (h >= 12 && h < 18) return 'afternoon';
          return 'evening';
        };
        const dateKey = (iso: string) => iso.slice(0, 10);

        // Map wearable by date
        const wearableByDate = new Map<string, { hrv: number | null; rhr: number | null }>();
        for (const w of wearable) {
          wearableByDate.set(w.summary_date, { hrv: w.hrv, rhr: w.resting_heart_rate });
        }

        // Sort check-ins ascending and index by epoch ms
        const sortedCheckins = checkins
          .filter((c) => c.timestamp)
          .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

        const findNextCheckin = (afterIso: string) => {
          const t = +new Date(afterIso);
          for (const c of sortedCheckins) {
            if (+new Date(c.timestamp) > t) return c;
          }
          return null;
        };
        const findPriorCheckin = (beforeIso: string) => {
          const t = +new Date(beforeIso);
          let last = null as (typeof sortedCheckins)[number] | null;
          for (const c of sortedCheckins) {
            if (+new Date(c.timestamp) < t) last = c;
            else break;
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
          thumbsTotal: number;
          deltaSum: number;
          deltaCount: number;
          isPlan: boolean;
        };
        const perContent = new Map<string, PracticeAgg>();
        const getAgg = (id: string, isPlan: boolean): PracticeAgg => {
          let a = perContent.get(id);
          if (!a) {
            a = { contentId: id, sessions: 0, thumbsUp: 0, thumbsTotal: 0, deltaSum: 0, deltaCount: 0, isPlan };
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

        for (const ev of completedEvents) {
          const a = getAgg(ev.content_id, ev.content_id.startsWith('plan-'));
          a.sessions += 1;

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
            const dow = new Date(ev.timestamp).getUTCDay();
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

          // Wearable next-AM lift: AM session → compare D vs D+1
          if (windowOf(ev.timestamp) === 'morning') {
            const d0 = dateKey(ev.timestamp);
            const d1Date = new Date(ev.timestamp);
            d1Date.setUTCDate(d1Date.getUTCDate() + 1);
            const d1 = dateKey(d1Date.toISOString());
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

        // Thumbs (star ratings ≥4 = up) attribution per content_id
        for (const r of feedbackRows) {
          if (!r.content_id || r.star_rating == null) continue;
          const a = getAgg(r.content_id, r.content_id.startsWith('plan-'));
          a.thumbsTotal += 1;
          if (r.star_rating >= 4) a.thumbsUp += 1;
        }

        // ── Build content title map ─────────────────────────────
        const allIds = Array.from(perContent.keys());
        const realIds = allIds.filter((id) => !id.startsWith('plan-'));
        const { data: contentData } = realIds.length
          ? await supabase
              .from('sanctuary_content')
              .select('id, title, category')
              .in('id', realIds)
          : { data: [] as any[] };
        const contentMap = new Map((contentData ?? []).map((c: any) => [c.id, c]));
        const eventCategoryMap = new Map<string, string>();
        for (const e of completedEvents) {
          if (e.content_id && e.category && !eventCategoryMap.has(e.content_id)) {
            eventCategoryMap.set(e.content_id, e.category);
          }
        }

        // ── Box 1 list (composite scoring) ──────────────────────
        const box1Practices = Array.from(perContent.values())
          .filter((a) => a.sessions > 0 || a.thumbsTotal > 0)
          .map((a) => {
            const meta = contentMap.get(a.contentId) as any;
            const isFav = favouriteIds.has(a.contentId);
            // Average delta normalised to 0..100 around 50 baseline
            const avgDelta = a.deltaCount > 0 ? a.deltaSum / a.deltaCount : 0;
            const baseScore = Math.max(0, Math.min(100, 50 + avgDelta));
            const thumbsRate = a.thumbsTotal > 0 ? a.thumbsUp / a.thumbsTotal : 0.5;
            const thumbsBoost = a.thumbsTotal > 0 ? (thumbsRate - 0.5) * 20 : 0;
            const favBoost = isFav ? 1.1 : 1.0;
            const composite = Math.max(0, Math.min(100, baseScore * favBoost + thumbsBoost));
            return {
              contentId: a.contentId,
              title:
                meta?.title ||
                (a.isPlan ? 'Daily plan' : eventCategoryMap.get(a.contentId) || 'Practice'),
              category: meta?.category || eventCategoryMap.get(a.contentId) || 'unknown',
              sessions: a.sessions,
              thumbsUp: a.thumbsUp,
              thumbsTotal: a.thumbsTotal,
              compositeScore: Math.round(composite),
              clarityDelta: Math.round(avgDelta),
              isFavourite: isFav,
              planBadge: a.isPlan ? 'Daily plan' : null,
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
              avgRating: topRow.thumbsTotal > 0 ? (topRow.thumbsUp / topRow.thumbsTotal) * 5 : 0,
            }
          : null;

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
          totalPractices < 3 ? 'day_1_6' : totalPractices < 10 ? 'day_7_29' : 'day_30_plus';

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
