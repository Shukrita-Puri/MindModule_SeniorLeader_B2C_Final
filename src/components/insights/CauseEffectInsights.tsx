/**
 * Cause-Effect Insights Component
 * Cross-references behavior_logs, sanctuary_events, and daily_checkins
 * to produce sentences like "When [trigger], you tend to [state/behavior]"
 */

import { useEffect, useState } from 'react';
import { Loader2, Lightbulb, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface CauseEffectPattern {
  trigger: string;
  outcome: string;
  confidence: number;
  occurrences: number;
  type: 'behavior' | 'practice' | 'calendar';
}

interface CauseEffectInsightsProps {
  userId?: string;
}

const stateBgColors: Record<string, string> = {
  focused: 'text-emerald-600 dark:text-emerald-400',
  steady: 'text-sky-600 dark:text-sky-400',
  scattered: 'text-amber-600 dark:text-amber-400',
  drained: 'text-slate-500 dark:text-slate-400',
  overwhelmed: 'text-red-600 dark:text-red-400'
};

const behaviorLabels: Record<string, string> = {
  avoided: 'Avoided',
  confronted: 'Confronted',
  listened: 'Listened',
  delayed: 'Delayed',
  delegated: 'Delegated',
  'over-controlled': 'Over-Controlled'
};

const CauseEffectInsights = ({ userId }: CauseEffectInsightsProps) => {
  const [patterns, setPatterns] = useState<CauseEffectPattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) fetchPatterns();
  }, [userId]);

  const fetchPatterns = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
    const results: CauseEffectPattern[] = [];

    try {
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      // Fetch all data in parallel
      const [behaviorsRes, checkInsRes, practicesRes] = await Promise.all([
        supabase
          .from('behavior_logs')
          .select('behavior_type, created_at')
          .eq('user_id', effectiveUserId)
          .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
        supabase
          .from('daily_checkins')
          .select('checkin_date, outcome')
          .eq('user_id', effectiveUserId)
          .gte('checkin_date', thirtyDaysAgo),
        supabase
          .from('sanctuary_events')
          .select('content_id, category, timestamp')
          .eq('user_id', effectiveUserId)
          .eq('event_type', 'completed')
          .gte('timestamp', new Date(thirtyDaysAgo).toISOString())
      ]);

      const behaviors = behaviorsRes.data || [];
      const checkIns = checkInsRes.data || [];
      const practices = practicesRes.data || [];

      // --- Behavior → Outcome correlations ---
      if (behaviors.length > 0 && checkIns.length > 0) {
        const behaviorOutcomes = new Map<string, Map<string, number>>();

        behaviors.forEach(b => {
          const bDate = new Date(b.created_at).toISOString().split('T')[0];
          const type = b.behavior_type?.toLowerCase();
          if (!type) return;

          // Same-day or next-day check-in
          const relevant = checkIns.filter(c => {
            const diff = (new Date(c.checkin_date).getTime() - new Date(bDate).getTime()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 1;
          });

          relevant.forEach(c => {
            const outcome = c.outcome?.toLowerCase();
            if (!outcome) return;
            if (!behaviorOutcomes.has(type)) behaviorOutcomes.set(type, new Map());
            const m = behaviorOutcomes.get(type)!;
            m.set(outcome, (m.get(outcome) || 0) + 1);
          });
        });

        behaviorOutcomes.forEach((outcomes, behaviorType) => {
          let total = 0, maxState = '', maxCount = 0;
          outcomes.forEach((count, state) => {
            total += count;
            if (count > maxCount) { maxCount = count; maxState = state; }
          });
          const confidence = total > 0 ? maxCount / total : 0;
          if (total >= 2 && confidence >= 0.5) {
            results.push({
              trigger: `you ${behaviorLabels[behaviorType] || behaviorType} in events`,
              outcome: maxState,
              confidence,
              occurrences: total,
              type: 'behavior'
            });
          }
        });
      }

      // --- Practice → Next-day outcome correlations ---
      if (practices.length > 0 && checkIns.length > 0) {
        const categoryOutcomes = new Map<string, Map<string, number>>();

        practices.forEach(p => {
          const pDate = new Date(p.timestamp).toISOString().split('T')[0];
          const nextDay = format(addDays(new Date(pDate), 1), 'yyyy-MM-dd');
          const category = p.category || 'practice';

          const nextDayCheckin = checkIns.find(c => c.checkin_date === nextDay);
          if (!nextDayCheckin?.outcome) return;

          const outcome = nextDayCheckin.outcome.toLowerCase();
          if (!categoryOutcomes.has(category)) categoryOutcomes.set(category, new Map());
          const m = categoryOutcomes.get(category)!;
          m.set(outcome, (m.get(outcome) || 0) + 1);
        });

        categoryOutcomes.forEach((outcomes, category) => {
          let total = 0, maxState = '', maxCount = 0;
          outcomes.forEach((count, state) => {
            total += count;
            if (count > maxCount) { maxCount = count; maxState = state; }
          });
          const confidence = total > 0 ? maxCount / total : 0;
          if (total >= 2 && confidence >= 0.5) {
            const label = category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ');
            results.push({
              trigger: `you complete ${label} practices`,
              outcome: maxState,
              confidence,
              occurrences: total,
              type: 'practice'
            });
          }
        });
      }

      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
      setPatterns(results.slice(0, 6));
    } catch (error) {
      console.error('Error fetching cause-effect patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Log behaviors and complete practices to discover cause-effect patterns.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Patterns emerge after 2+ repeated behaviors or practice sessions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patterns.map((pattern, index) => (
        <div
          key={index}
          className="p-3 rounded-lg bg-muted/30 border border-border/50"
        >
          <p className="text-sm text-foreground leading-relaxed">
            <span className="text-muted-foreground">When</span>{' '}
            <span className="font-medium">{pattern.trigger}</span>
            <span className="text-muted-foreground">, you tend to check in </span>
            <span className={cn('font-semibold capitalize', stateBgColors[pattern.outcome] || 'text-foreground')}>
              {pattern.outcome}
            </span>
            <span className="text-muted-foreground">
              {' '}{Math.round(pattern.confidence * 100)}% of the time
            </span>
            <span className="text-muted-foreground/60 text-xs ml-1">
              ({pattern.occurrences} occurrences)
            </span>
          </p>
        </div>
      ))}

      <p className="text-[10px] text-muted-foreground/60 text-center">
        Based on last 30 days of behaviors, practices, and check-ins
      </p>
    </div>
  );
};

export default CauseEffectInsights;
