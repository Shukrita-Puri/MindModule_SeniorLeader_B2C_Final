/**
 * Calendar-State Correlations Component
 * Shows patterns like "Board Meeting days correlate with overwhelmed state 85%"
 */

import { useEffect, useState } from 'react';
import { Loader2, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface CalendarCorrelation {
  eventKeyword: string;
  typicalState: string;
  occurrences: number;
  confidence: number;
}

interface CalendarStateCorrelationsProps {
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

const CalendarStateCorrelations = ({ userId }: CalendarStateCorrelationsProps) => {
  const [correlations, setCorrelations] = useState<CalendarCorrelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasCalendar, setHasCalendar] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchCorrelations();
    }
  }, [userId]);

  const fetchCorrelations = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;

    try {
      // Check if user has calendar connected
      const { data: calendarConn } = await supabase
        .from('calendar_connections')
        .select('id, is_active')
        .eq('user_id', effectiveUserId)
        .eq('is_active', true)
        .maybeSingle();

      setHasCalendar(!!calendarConn);

      if (!calendarConn) {
        setLoading(false);
        return;
      }

      // Get last 30 days of check-ins
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', thirtyDaysAgo);

      if (!checkIns || checkIns.length < 5) {
        setLoading(false);
        return;
      }

      // Get calendar events for same period
      const { data: events } = await supabase
        .from('calendar_events')
        .select('title, start_time')
        .eq('user_id', effectiveUserId)
        .gte('start_time', new Date(thirtyDaysAgo).toISOString());

      if (!events || events.length === 0) {
        setLoading(false);
        return;
      }

      // Analyze correlations
      const correlationMap = new Map<string, Map<string, number>>();
      
      // Keywords to track (high-stakes events)
      const keywords = [
        'board', 'quarterly', 'investor', 'pitch', 'review', 
        'presentation', 'interview', 'deadline', 'client', 'all-hands',
        'performance', 'budget', 'strategy', 'executive', 'stakeholder'
      ];

      checkIns.forEach(checkIn => {
        const checkInDate = new Date(checkIn.checkin_date).toDateString();
        const outcome = checkIn.outcome?.toLowerCase();
        
        if (!outcome) return;

        // Find events on this day
        const dayEvents = events.filter(e => {
          const eventDate = new Date(e.start_time).toDateString();
          return eventDate === checkInDate;
        });

        dayEvents.forEach(event => {
          const titleLower = (event.title || '').toLowerCase();
          
          keywords.forEach(keyword => {
            if (titleLower.includes(keyword)) {
              if (!correlationMap.has(keyword)) {
                correlationMap.set(keyword, new Map());
              }
              const stateCount = correlationMap.get(keyword)!;
              stateCount.set(outcome, (stateCount.get(outcome) || 0) + 1);
            }
          });
        });
      });

      // Convert to array and calculate confidence
      const results: CalendarCorrelation[] = [];
      
      correlationMap.forEach((stateCounts, keyword) => {
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

        // Only include if we have at least 3 occurrences and >50% confidence
        const confidence = totalOccurrences > 0 ? maxCount / totalOccurrences : 0;
        if (totalOccurrences >= 3 && confidence >= 0.5) {
          results.push({
            eventKeyword: keyword.charAt(0).toUpperCase() + keyword.slice(1),
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
      console.error('Error fetching calendar correlations:', error);
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

  if (!hasCalendar) {
    return (
      <div className="text-center py-6 space-y-2">
        <Calendar className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Connect your calendar to see event-state patterns.
        </p>
      </div>
    );
  }

  if (correlations.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Not enough data yet. Keep checking in to discover patterns.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Patterns require at least 3 occurrences
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Correlation Rows */}
      <div className="space-y-3">
        {correlations.map((correlation, index) => (
          <div 
            key={correlation.eventKeyword}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
          >
            {/* Event keyword */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm text-foreground truncate">
                  When you have {correlation.eventKeyword} events
                </span>
              </div>
            </div>
            
            {/* Arrow indicator */}
            <span className="text-muted-foreground text-sm">→</span>
            
            {/* State badge */}
            <div className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border capitalize",
              stateBgColors[correlation.typicalState] || 'bg-muted text-muted-foreground'
            )}>
              you feel {correlation.typicalState}
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
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            When you have {correlations[0].eventKeyword} events, you check in{' '}
            <span className="font-medium">{correlations[0].typicalState}</span>{' '}
            {Math.round(correlations[0].confidence * 100)}% of the time ({correlations[0].occurrences} occurrences).
            Consider scheduling preparation time before these meetings.
          </p>
        </div>
      )}

      {/* Data source note */}
      <p className="text-[10px] text-muted-foreground/60 text-center">
        Based on last 30 days of check-ins and calendar events
      </p>
    </div>
  );
};

export default CalendarStateCorrelations;
