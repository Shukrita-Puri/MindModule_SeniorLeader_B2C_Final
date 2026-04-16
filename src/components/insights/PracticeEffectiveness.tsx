/**
 * Practice Effectiveness Component
 * Shows which practices precede state improvements
 * "Your top restorer: [Practice Name] (used X times, Y% followed by improved state)"
 */

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays, addDays } from 'date-fns';

interface PracticeEffect {
  contentId: string;
  title: string;
  category: string;
  timesUsed: number;
  improvedAfter: number;
  effectivenessRate: number;
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

      // Fetch completed practices
      const { data: practices } = await supabase
        .from('sanctuary_events')
        .select('content_id, category, timestamp')
        .eq('user_id', effectiveUserId)
        .eq('event_type', 'completed')
        .gte('timestamp', new Date(thirtyDaysAgo).toISOString());

      if (!practices || practices.length === 0) {
        setLoading(false);
        return;
      }

      setTotalPractices(practices.length);

      // Fetch check-ins for same period
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', thirtyDaysAgo);

      if (!checkIns || checkIns.length < 2) {
        setLoading(false);
        return;
      }

      // Fetch content titles
      const contentIds = [...new Set(practices.map(p => p.content_id))];
      const { data: contentData } = await supabase
        .from('sanctuary_content')
        .select('id, title, category')
        .in('id', contentIds);

      const contentMap = new Map(contentData?.map(c => [c.id, c]) || []);

      // Positive states
      const positiveStates = new Set(['focused', 'steady']);

      // For each practice, check if next-day check-in improved
      const practiceEffects = new Map<string, { timesUsed: number; improvedAfter: number; title: string; category: string }>();

      practices.forEach(practice => {
        const practiceDate = new Date(practice.timestamp).toISOString().split('T')[0];
        const nextDay = format(addDays(new Date(practiceDate), 1), 'yyyy-MM-dd');

        const nextDayCheckin = checkIns.find(c => c.checkin_date === nextDay);
        const sameDayCheckin = checkIns.find(c => c.checkin_date === practiceDate);

        const content = contentMap.get(practice.content_id);
        const title = content?.title || practice.category || 'Unknown';
        const category = content?.category || practice.category || 'unknown';

        if (!practiceEffects.has(practice.content_id)) {
          practiceEffects.set(practice.content_id, { timesUsed: 0, improvedAfter: 0, title, category });
        }

        const effect = practiceEffects.get(practice.content_id)!;
        effect.timesUsed++;

        // Check if next-day state is positive, or improved from same-day
        if (nextDayCheckin) {
          const nextOutcome = nextDayCheckin.outcome?.toLowerCase();
          const sameOutcome = sameDayCheckin?.outcome?.toLowerCase();

          if (nextOutcome && positiveStates.has(nextOutcome)) {
            effect.improvedAfter++;
          } else if (nextOutcome && sameOutcome && !positiveStates.has(sameOutcome) && positiveStates.has(nextOutcome)) {
            effect.improvedAfter++;
          }
        }
      });

      // Find top practice by effectiveness rate (min 2 uses)
      let best: PracticeEffect | null = null;

      practiceEffects.forEach((effect, contentId) => {
        if (effect.timesUsed >= 2) {
          const rate = effect.improvedAfter / effect.timesUsed;
          if (!best || rate > best.effectivenessRate || (rate === best.effectivenessRate && effect.timesUsed > best.timesUsed)) {
            best = {
              contentId,
              title: effect.title,
              category: effect.category,
              timesUsed: effect.timesUsed,
              improvedAfter: effect.improvedAfter,
              effectivenessRate: rate
            };
          }
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
      </div>

      {topPractice ? (
        <>
          <p className="text-lg font-headline font-semibold text-foreground leading-snug">
            {topPractice.title}
          </p>
          <p className="text-xs text-muted-foreground">
            Used {topPractice.timesUsed}× · {Math.round(topPractice.effectivenessRate * 100)}% followed by improved state
          </p>
          <p className="text-xs text-saffron">Your top restorer</p>
        </>
      ) : totalPractices > 0 ? (
        <>
          <p className="text-2xl font-headline font-semibold text-foreground">{totalPractices}</p>
          <p className="text-xs text-muted-foreground">practices completed</p>
          <p className="text-xs text-muted-foreground/60">Use 2+ times to see effectiveness</p>
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
