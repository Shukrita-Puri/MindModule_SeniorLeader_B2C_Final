import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getRitualRange } from '@/utils/dailyRituals';
import { Check, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const WeeklyRitualStreak = () => {
  const { user } = useAuth();
  
  const { data: weeklyData, isLoading } = useQuery({
    queryKey: ['weekly-ritual-streak', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const today = new Date();
      // Use local date string to avoid timezone issues (YYYY-MM-DD format)
      const todayStr = today.toLocaleDateString('en-CA');
      
      // Calculate this week's Monday using local dates
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 6 days from Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      const startDate = monday.toLocaleDateString('en-CA');
      const endDate = sunday.toLocaleDateString('en-CA');
      
      console.log('[WeeklyRitualStreak] Fetching range:', { startDate, endDate, todayStr });
      
      // Use edge function instead of direct Supabase call
      const data = await getRitualRange(startDate, endDate);
      console.log('[WeeklyRitualStreak] Received data:', data);
      
      // Map Monday-Sunday for this week, preserving historical completion data
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toLocaleDateString('en-CA');
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const isToday = dateStr === todayStr;
        const isFuture = date > today;
        
        const completion = data?.find(d => d.ritual_date === dateStr);
        
        // Calculate status based on actual completions
        let status: 'full' | 'partial' | 'skipped' = 'skipped';
        
        if (completion) {
          // Check boolean completion fields
          const booleanCount = [
            completion.soundscape_completed,
            completion.guided_practice_completed,
            completion.micro_exercise_completed
          ].filter(Boolean).length;
          
          // Also count completed_practice_ids for coach sessions and other practices
          const idsCount = (completion.completed_practice_ids || []).length;
          const effectiveCompleted = Math.max(booleanCount, idsCount);
          
          const totalRecommended = completion.recommended_practices_count || 3;
          
          if (completion.completion_status === 'full' || (effectiveCompleted >= totalRecommended && effectiveCompleted > 0)) {
            status = 'full';
          } else if (effectiveCompleted > 0 || completion.completion_status === 'partial') {
            status = 'partial';
          }
        }
        
        weekDays.push({ date: dateStr, day: dayName, isToday, status, isFuture });
      }
      
      return weekDays;
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex justify-between items-center gap-1 mb-4">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center gap-0.5 sm:gap-1 w-full overflow-hidden">
        {weeklyData?.map((day) => (
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
              "text-[9px] sm:text-[10px] truncate",
              day.isToday ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              {day.day}
            </span>
          </div>
        ))}
    </div>
  );
};

export default WeeklyRitualStreak;
