/**
 * Practice Effectiveness Component
 *
 * Single source of truth: in-app feedback modal ratings stored in
 *   content_relevance_feedback (feedback_type='star_rating',
 *   trigger_context='post_practice_completion' or 'post_plan_completion').
 *
 * Secondary/derived: same-day → next-day check-in state improvement
 * (kept for context, never overrides modal feedback).
 */

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
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
    try {
      // Reads are RLS-blocked from the browser (Auth0, no Supabase JWT).
      // Route through the Auth0-aware edge function which uses the service role
      // after verifying the user's token. Covers both practice-level and
      // plan-level ratings.
      const token = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('content-feedback', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: { action: 'GET_PRACTICE_IMPACT' },
      });
      if (error) throw error;
      const payload = (data as any)?.data ?? {};
      const top = payload.topPractice
        ? {
            contentId: payload.topPractice.contentId,
            title: payload.topPractice.title,
            category: payload.topPractice.category,
            timesUsed: payload.topPractice.timesUsed,
            avgRating: payload.topPractice.avgRating,
            stateImproved: 0,
          }
        : null;
      setTopPractice(top);
      setTotalPractices(typeof payload.totalPractices === 'number' ? payload.totalPractices : 0);
    } catch (error) {
      console.error('Error fetching practice effectiveness:', error);
      setTopPractice(null);
      setTotalPractices(0);
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
          explanation="Based on the star ratings you've given practices and daily plans over the last 30 days. We highlight whichever you've rated highest."
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
