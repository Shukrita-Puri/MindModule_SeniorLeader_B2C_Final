import { useQuery } from '@tanstack/react-query';
import { Check, Star } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { getRitualRange } from '@/utils/dailyRituals';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

interface DailyShowUpCalendarProps {
  userId?: string;
}

/**
 * "Did You Show Up For Yourself?" — Mon–Sun calendar reusing WeeklyRitualStreak's
 * visual language. A day counts as "showed up" when the user has any check-in OR
 * any priority completed (any window) on that date.
 */
const DailyShowUpCalendar = ({ userId }: DailyShowUpCalendarProps) => {
  const { data: weekDays, isLoading } = useQuery({
    queryKey: ['daily-showup-calendar', userId],
    queryFn: async () => {
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-CA');

      // Calculate this week's Monday using local dates
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const startDate = monday.toLocaleDateString('en-CA');
      const endDate = sunday.toLocaleDateString('en-CA');

      // Fetch rituals (priorities) and check-ins in parallel
      const ritualsPromise = getRitualRange(startDate, endDate);

      const checkinsPromise = (async (): Promise<{ checkin_date: string }[]> => {
        try {
          if (DEV_MODE) {
            const { data } = await supabase
              .from('daily_checkins')
              .select('checkin_date')
              .eq('user_id', DEV_USER.id)
              .gte('checkin_date', startDate)
              .lte('checkin_date', endDate);
            return data || [];
          }
          const accessToken = await getAuthToken();
          if (!accessToken) return [];
          const { data } = await supabase
            .from('daily_checkins')
            .select('checkin_date')
            .gte('checkin_date', startDate)
            .lte('checkin_date', endDate);
          return data || [];
        } catch (err) {
          console.error('[DailyShowUpCalendar] check-in fetch failed:', err);
          return [];
        }
      })();

      const [rituals, checkins] = await Promise.all([ritualsPromise, checkinsPromise]);

      const checkinDates = new Set(checkins.map((c) => c.checkin_date));

      const days: Array<{
        date: string;
        day: string;
        isToday: boolean;
        isFuture: boolean;
        status: 'full' | 'partial' | 'skipped';
      }> = [];

      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toLocaleDateString('en-CA');
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const isToday = dateStr === todayStr;
        const isFuture = date > today && !isToday;

        const ritual = rituals?.find((r) => r.ritual_date === dateStr);
        const hasCheckin = checkinDates.has(dateStr);
        const priorityDone = !!ritual && (
          (ritual.completed_practice_ids || []).length >= 1 ||
          !!ritual.soundscape_completed ||
          !!ritual.guided_practice_completed ||
          !!ritual.micro_exercise_completed
        );

        let status: 'full' | 'partial' | 'skipped' = 'skipped';
        if (hasCheckin && priorityDone) status = 'full';
        else if (hasCheckin || priorityDone) status = 'partial';

        days.push({ date: dateStr, day: dayName, isToday, isFuture, status });
      }

      return days;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Did You Show Up For Yourself?
          </span>
          <InsightInfoModal
            title="Did You Show Up For Yourself?"
            explanation="A day counts when you check in OR complete at least one of your daily priorities (any window). It's not about doing everything — it's about showing up."
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-between items-center gap-1">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center gap-0.5 sm:gap-1 w-full overflow-hidden">
              {weekDays?.map((day) => (
                <div key={day.date} className="flex flex-col items-center gap-0.5 sm:gap-1 min-w-0 flex-1">
                  <div className={cn(
                    "h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center transition-all relative",
                    day.status === 'full' && "bg-saffron text-charcoal shadow-md",
                    day.status === 'partial' && "bg-taupe/80 text-white",
                    day.status === 'skipped' && !day.isFuture && "border-2 border-taupe/40 bg-muted/30",
                    day.status === 'skipped' && day.isFuture && "border-2 border-dashed border-taupe/50",
                    day.isToday && "ring-2 ring-saffron ring-offset-2 ring-offset-background",
                    day.isToday && day.status !== 'full' && "shadow-[0_0_12px_rgba(212,175,55,0.5)] animate-pulse"
                  )}>
                    {day.status === 'full' && <Check size={14} strokeWidth={3} />}
                    {day.status === 'partial' && <Star size={12} fill="currentColor" />}
                  </div>
                  <span className={cn(
                    "text-xs truncate",
                    day.isToday ? "text-primary font-semibold" : "text-muted-foreground"
                  )}>
                    {day.day}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-3 text-center">
              A day counts when you check in or complete any priority.
            </p>
          </>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default DailyShowUpCalendar;