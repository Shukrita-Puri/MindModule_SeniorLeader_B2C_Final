/**
 * Behavior-Outcome Correlations Component
 * Shows cause-effect patterns like "When you Confronted in meetings, you checked in Focused 70% of the time"
 */

import { useEffect, useState } from 'react';
import { Loader2, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface BehaviorCorrelation {
  behaviorType: string;
  typicalState: string;
  occurrences: number;
  confidence: number;
}

interface BehaviorOutcomeCorrelationsProps {
  userId?: string;
}

// State colors matching Insights page
const stateColors: Record<string, string> = {
  focused: 'bg-emerald-500',
  steady: 'bg-blue-500',
  scattered: 'bg-amber-500',
  drained: 'bg-slate-400',
  overwhelmed: 'bg-red-500'
};

const stateBgColors: Record<string, string> = {
  focused: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  steady: 'bg-blue-100 text-blue-700 border-blue-200',
  scattered: 'bg-amber-100 text-amber-700 border-amber-200',
  drained: 'bg-slate-100 text-slate-700 border-slate-200',
  overwhelmed: 'bg-red-100 text-red-700 border-red-200'
};

// Behavior type display names
const behaviorLabels: Record<string, string> = {
  avoided: 'Avoided',
  confronted: 'Confronted',
  listened: 'Listened',
  delayed: 'Delayed',
  delegated: 'Delegated',
  'over-controlled': 'Over-Controlled'
};

const BehaviorOutcomeCorrelations = ({ userId }: BehaviorOutcomeCorrelationsProps) => {
  const [correlations, setCorrelations] = useState<BehaviorCorrelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasBehaviors, setHasBehaviors] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchCorrelations();
    }
  }, [userId]);

  const fetchCorrelations = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;

    try {
      // Get last 30 days of behavior logs
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      
      const { data: behaviors } = await supabase
        .from('behavior_logs')
        .select('behavior_type, created_at')
        .eq('user_id', effectiveUserId)
        .gte('created_at', new Date(thirtyDaysAgo).toISOString());

      if (!behaviors || behaviors.length === 0) {
        setLoading(false);
        return;
      }

      setHasBehaviors(true);

      // Get check-ins for same period
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', thirtyDaysAgo);

      if (!checkIns || checkIns.length === 0) {
        setLoading(false);
        return;
      }

      // Analyze correlations between behaviors and check-in outcomes
      const correlationMap = new Map<string, Map<string, number>>();

      behaviors.forEach(behavior => {
        const behaviorDate = new Date(behavior.created_at).toDateString();
        const behaviorType = behavior.behavior_type?.toLowerCase();

        if (!behaviorType) return;

        // Find check-in on same day or next day
        const relevantCheckIns = checkIns.filter(checkin => {
          const checkInDate = new Date(checkin.checkin_date).toDateString();
          const behaviorDateObj = new Date(behaviorDate);
          const checkInDateObj = new Date(checkInDate);
          
          // Same day or next day
          const dayDiff = Math.floor((checkInDateObj.getTime() - behaviorDateObj.getTime()) / (1000 * 60 * 60 * 24));
          return dayDiff >= 0 && dayDiff <= 1;
        });

        relevantCheckIns.forEach(checkin => {
          const outcome = checkin.outcome?.toLowerCase();
          if (!outcome) return;

          if (!correlationMap.has(behaviorType)) {
            correlationMap.set(behaviorType, new Map());
          }
          const stateCount = correlationMap.get(behaviorType)!;
          stateCount.set(outcome, (stateCount.get(outcome) || 0) + 1);
        });
      });

      // Convert to array and calculate confidence
      const results: BehaviorCorrelation[] = [];

      correlationMap.forEach((stateCounts, behaviorType) => {
        let totalOccurrences = 0;
        let maxState = '';
        let maxCount = 0;

        stateCounts.forEach((count, state) => {
          totalOccurrences += count;
          if (count > maxCount) {
            maxCount = count;
            maxState = state;
          }
        });

        // Only include if we have at least 2 occurrences and >50% confidence
        const confidence = totalOccurrences > 0 ? maxCount / totalOccurrences : 0;
        if (totalOccurrences >= 2 && confidence >= 0.5) {
          results.push({
            behaviorType,
            typicalState: maxState,
            occurrences: totalOccurrences,
            confidence
          });
        }
      });

      // Sort by confidence then occurrences
      results.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);

      setCorrelations(results.slice(0, 5)); // Top 5 patterns
    } catch (error) {
      console.error('Error fetching behavior-outcome correlations:', error);
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

  if (!hasBehaviors) {
    return (
      <div className="text-center py-6 space-y-2">
        <Activity className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Log behaviors after events to see patterns.
        </p>
      </div>
    );
  }

  if (correlations.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Not enough data yet. Keep logging to discover patterns.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Patterns require at least 2 occurrences with consistent outcomes
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Correlation Rows */}
      <div className="space-y-3">
        {correlations.map((correlation) => (
          <div
            key={correlation.behaviorType}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
          >
            {/* Behavior type */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm text-foreground truncate">
                  When you {behaviorLabels[correlation.behaviorType] || correlation.behaviorType}
                </span>
              </div>
            </div>

            {/* Arrow indicator */}
            <span className="text-muted-foreground text-sm">→</span>

            {/* State badge */}
            <div
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border capitalize',
                stateBgColors[correlation.typicalState] || 'bg-muted text-muted-foreground'
              )}
            >
              {correlation.typicalState}
            </div>

            {/* Confidence percentage */}
            <div className="text-right min-w-[60px]">
              <span className="text-sm font-semibold text-foreground">
                {Math.round(correlation.confidence * 100)}%
              </span>
              <p className="text-[10px] text-muted-foreground">
                ({correlation.occurrences}×)
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Insight Summary */}
      {correlations.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-800/30">
          <AlertCircle className="h-4 w-4 text-sky-600 dark:text-sky-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-sky-800 dark:text-sky-200 leading-relaxed">
            When you {behaviorLabels[correlations[0].behaviorType] || correlations[0].behaviorType}, you tend to check in{' '}
            <span className="font-medium">{correlations[0].typicalState}</span>. This pattern might suggest how your
            response style affects your mental state.
          </p>
        </div>
      )}

      {/* Data source note */}
      <p className="text-[10px] text-muted-foreground/60 text-center">
        Based on last 30 days of behavior logs and check-ins
      </p>
    </div>
  );
};

export default BehaviorOutcomeCorrelations;
