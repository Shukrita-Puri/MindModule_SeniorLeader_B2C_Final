import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

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
    console.log(`[content-feedback] Action: ${action}, User: ${userId}`);

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

        // CRF is the single source of truth for Brief/Plan/Practice ratings.
        // Read practice + plan-level star ratings here (exclude brief_inline).
        const { data: feedbackRows, error: fbErr } = await supabase
          .from('content_relevance_feedback')
          .select('content_id, content_type, star_rating, session_id, trigger_context, created_at')
          .eq('user_id', userId)
          .eq('feedback_type', 'star_rating')
          .not('star_rating', 'is', null)
          .gte('created_at', sinceIso);
        if (fbErr) {
          console.error('[content-feedback] GET_PRACTICE_IMPACT feedback error:', fbErr);
          throw fbErr;
        }

        const practiceFeedback = (feedbackRows ?? []).filter(
          (r: any) =>
            !r.trigger_context ||
            r.trigger_context === 'post_practice_completion' ||
            r.trigger_context === 'post_plan_completion'
        );

        // Completion count (engagement signal, not feedback)
        const { data: completedEvents, error: evErr } = await supabase
          .from('sanctuary_events')
          .select('content_id, category, timestamp')
          .eq('user_id', userId)
          .in('event_type', ['completed', 'session_complete'])
          .gte('timestamp', sinceIso);
        if (evErr) {
          console.error('[content-feedback] GET_PRACTICE_IMPACT events error:', evErr);
          throw evErr;
        }

        const totalPractices = completedEvents?.length ?? 0;

        // Aggregate per content_id
        type Agg = { total: number; count: number };
        const perContent = new Map<string, Agg>();
        const ensure = (id: string): Agg => {
          let a = perContent.get(id);
          if (!a) {
            a = { total: 0, count: 0 };
            perContent.set(id, a);
          }
          return a;
        };

        for (const r of practiceFeedback) {
          if (!r.content_id || r.star_rating == null) continue;
          const a = ensure(r.content_id);
          a.total += r.star_rating;
          a.count += 1;
        }

        if (perContent.size === 0) {
          return new Response(
            JSON.stringify({ data: { topPractice: null, totalPractices } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const ratedIds = Array.from(perContent.keys());
        const { data: contentData } = await supabase
          .from('sanctuary_content')
          .select('id, title, category')
          .in('id', ratedIds);
        const contentMap = new Map((contentData ?? []).map((c: any) => [c.id, c]));

        const eventCategoryMap = new Map<string, string>();
        for (const e of completedEvents ?? []) {
          if (e.content_id && e.category && !eventCategoryMap.has(e.content_id)) {
            eventCategoryMap.set(e.content_id, e.category);
          }
        }

        let best: {
          contentId: string;
          title: string;
          category: string;
          timesUsed: number;
          avgRating: number;
        } | null = null;
        let bestScore = -1;
        perContent.forEach((agg, contentId) => {
          const avg = agg.total / agg.count;
          const score = avg * 100 + Math.min(agg.count, 5);
          if (score > bestScore) {
            bestScore = score;
            const content = contentMap.get(contentId) as any;
            const isPlanBucket = contentId.startsWith('plan-');
            best = {
              contentId,
              title:
                content?.title ||
                (isPlanBucket
                  ? 'Your daily plan'
                  : eventCategoryMap.get(contentId) || 'Practice'),
              category: content?.category || eventCategoryMap.get(contentId) || 'unknown',
              timesUsed: agg.count,
              avgRating: avg,
            };
          }
        });

        return new Response(
          JSON.stringify({ data: { topPractice: best, totalPractices } }),
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
