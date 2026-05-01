/**
 * Practice Effectiveness Component
 *
 * Primary source: in-app feedback modal ratings stored in
 *   - content_relevance_feedback (star_rating, post_practice_completion)
 *   - practice_sessions.effectiveness_rating
 *
 * Secondary/derived: same-day → next-day check-in state improvement
 * (kept for context, never overrides modal feedback).
 */

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays } from 'date-fns';
import InsightInfoModal from '@/components/insights/InsightInfoModal';

interface PracticeEffect {
  contentId: string;
  title: string;
  category: string;
  timesUsed: number;
  avgRating: number;       // mean star rating (0..5)
  stateImproved: number;   // count of sessions followed by an improved check-in
}

interface PracticeEffectivenessProps {
  userId?: string;
}

const PracticeEffectiveness = ({ userId }: PracticeEffectivenessProps) => {
  const [topPractice, setTopPractice] = useState<PracticeEffect | null>(null);
  const [totalPractices, setTotalPractices] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) fetchEffectiveness();
  }, [userId]);

  const fetchEffectiveness = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;

    try {
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const thirtyDaysAgoIso = new Date(thirtyDaysAgo).toISOString();

      // ── PRIMARY SOURCE: feedback modal ratings ──────────────────────────
      // Accept any practice-anchored rating context. Exclude `brief_inline`
      // which rates the morning brief, not a practice.
      const { data: feedbackRows } = await supabase
        .from('content_relevance_feedback')
        .select('content_id, content_type, star_rating, session_id, created_at, trigger_context')
        .eq('user_id', effectiveUserId)
        .eq('feedback_type', 'star_rating')
        .not('star_rating', 'is', null)
        .gte('created_at', thirtyDaysAgoIso);

      const practiceFeedback = (feedbackRows ?? []).filter(
        (r) =>
          !r.trigger_context ||
          r.trigger_context === 'post_practice_completion' ||
          r.trigger_context === 'post_plan_completion'
      );

      // ── SECONDARY SOURCE: practice_sessions.effectiveness_rating ───────
      const { data: sessionRows } = await supabase
        .from('practice_sessions')
        .select('id, content_id, effectiveness_rating, completed_at')
        .eq('user_id', effectiveUserId)
        .not('effectiveness_rating', 'is', null)
        .gte('completed_at', thirtyDaysAgoIso);

      // ── COUNT: completed practices (accept both event-type spellings) ──
      const { data: completedEvents } = await supabase
        .from('sanctuary_events')
        .select('content_id, category, timestamp')
        .eq('user_id', effectiveUserId)
        .in('event_type', ['completed', 'session_complete'])
        .gte('timestamp', thirtyDaysAgoIso);

      const completionCount = completedEvents?.length ?? 0;
      setTotalPractices(completionCount);

      // Aggregate ratings per content_id (modal feedback first, sessions second).
      type Agg = { total: number; count: number; sessionIds: Set<string> };
      const perContent = new Map<string, Agg>();
      const ensure = (id: string): Agg => {
        let a = perContent.get(id);
        if (!a) {
          a = { total: 0, count: 0, sessionIds: new Set() };
          perContent.set(id, a);
        }
        return a;
      };

      practiceFeedback.forEach((r) => {
        if (!r.content_id || r.star_rating == null) return;
        const a = ensure(r.content_id);
        a.total += r.star_rating;
        a.count += 1;
        if (r.session_id) a.sessionIds.add(r.session_id);
      });

      // Add session-level ratings only when not already represented by a
      // feedback row pointing at the same session_id.
      (sessionRows ?? []).forEach((s) => {
        if (!s.content_id || s.effectiveness_rating == null) return;
        const a = ensure(s.content_id);
        if (s.id && a.sessionIds.has(s.id)) return;
        a.total += s.effectiveness_rating;
        a.count += 1;
      });

      // No ratings yet → render the "completed N practices" empty state.
      if (perContent.size === 0) {
        setTopPractice(null);
        return;
      }

      // Resolve titles for rated content. Plan-level rows (e.g. `plan-tod`)
      // won't match sanctuary_content; we surface them with a friendly label.
      const ratedIds = Array.from(perContent.keys());
      const { data: contentData } = await supabase
        .from('sanctuary_content')
        .select('id, title, category')
        .in('id', ratedIds);
      const contentMap = new Map((contentData ?? []).map((c) => [c.id, c]));

      // Fallback category lookup from sanctuary_events when content row missing.
      const eventCategoryMap = new Map<string, string>();
      (completedEvents ?? []).forEach((e) => {
        if (e.content_id && e.category && !eventCategoryMap.has(e.content_id)) {
          eventCategoryMap.set(e.content_id, e.category);
        }
      });

      // Pick top: highest avg rating; tiebreak by rating count, then recency
      // (implicit via Map insertion order). Threshold ≥ 1 rating.
      let best: PracticeEffect | null = null;
      let bestScore = -1;
      perContent.forEach((agg, contentId) => {
        const avg = agg.total / agg.count;
        // Composite score lightly favors more-rated practices at equal avg.
        const score = avg * 100 + Math.min(agg.count, 5);
        if (score > bestScore) {
          bestScore = score;
          const content = contentMap.get(contentId);
          const isPlanBucket = contentId.startsWith('plan-');
          best = {
            contentId,
            title:
              content?.title ||
              (isPlanBucket ? 'Your daily plan' : eventCategoryMap.get(contentId) || 'Practice'),
            category: content?.category || eventCategoryMap.get(contentId) || 'unknown',
            timesUsed: agg.count,
            avgRating: avg,
            stateImproved: 0,
          };
        }
      });

      setTopPractice(best);
    } catch (error) {
      console.error('Error fetching practice effectiveness:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-saffron" />
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Practice Impact</span>
        <InsightInfoModal
          title="Practice Impact"
          explanation="Based on the star ratings you've given practices over the last 30 days. We highlight the practice you've rated highest. The more you rate, the sharper this gets."
        />
      </div>

      {topPractice ? (
        <>
          <p className="text-lg font-headline font-semibold text-foreground leading-snug">
            {topPractice.title}
          </p>
          <p className="text-xs text-muted-foreground">
            Avg {topPractice.avgRating.toFixed(1)} / 5 across {topPractice.timesUsed} rating{topPractice.timesUsed === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-saffron">Highest-rated this month</p>
        </>
      ) : totalPractices > 0 ? (
        <>
          <p className="text-2xl font-headline font-semibold text-foreground">{totalPractices}</p>
          <p className="text-xs text-muted-foreground">practices completed</p>
          <p className="text-xs text-muted-foreground/60">Rate practices after completion to see what works</p>
        </>
      ) : (
        <>
          <Activity className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Complete practices to track impact</p>
        </>
      )}
    </div>
  );
};

export default PracticeEffectiveness;
