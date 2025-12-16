import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Check, Star, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useStreakTracking } from '@/hooks/useStreakTracking';

const WeeklyRitualStreak = () => {
  const { user } = useAuth();
  const { currentStreak, milestones } = useStreakTracking();
  
  const { data: weeklyData, isLoading } = useQuery({
    queryKey: ['weekly-ritual-streak', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const today = new Date();
      
      // Calculate this week's Monday
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 6 days from Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      const { data, error } = await supabase
        .from('daily_ritual_completions')
        .select('ritual_date, completion_status, soundscape_completed, guided_practice_completed, micro_exercise_completed, recommended_practices_count')
        .eq('user_id', user.id)
        .gte('ritual_date', monday.toISOString().split('T')[0])
        .lte('ritual_date', sunday.toISOString().split('T')[0])
        .order('ritual_date', { ascending: true });
        
      if (error) throw error;
      
      // Map Monday-Sunday for this week, preserving historical completion data
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const todayStr = today.toISOString().split('T')[0];
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
          
          const totalRecommended = completion.recommended_practices_count || 3;
          
          if (completion.completion_status === 'full' || booleanCount >= totalRecommended) {
            status = 'full';
          } else if (booleanCount > 0 || completion.completion_status === 'partial') {
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

  // Check if current streak is at a milestone
  const isStreakMilestone = milestones.includes(currentStreak);

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
    <div className="space-y-3">
      {/* Streak Badge */}
      {currentStreak > 0 && (
        <div className={cn(
          "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full mx-auto w-fit",
          isStreakMilestone 
            ? "bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30" 
            : "bg-muted/50"
        )}>
          <span className={cn(
            "text-lg",
            isStreakMilestone && "animate-pulse"
          )}>🔥</span>
          <span className={cn(
            "text-sm font-semibold",
            isStreakMilestone ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )}>
            {currentStreak} Day Streak
          </span>
          {isStreakMilestone && <Sparkles size={14} className="text-amber-500" />}
        </div>
      )}
      
      {/* Weekly Circles */}
      <div className="flex justify-between items-center gap-1">
        {weeklyData?.map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center transition-all relative",
              day.status === 'full' && "bg-saffron text-charcoal shadow-md",
              day.status === 'partial' && "bg-taupe/80 text-white",
              day.status === 'skipped' && !day.isFuture && "border-2 border-taupe/40 bg-muted/30",
              day.status === 'skipped' && day.isFuture && "border-2 border-dashed border-taupe/50",
              day.isToday && "ring-2 ring-saffron ring-offset-2 ring-offset-background",
              day.isToday && day.status !== 'full' && "shadow-[0_0_12px_rgba(212,175,55,0.5)] animate-pulse"
            )}>
              {day.status === 'full' && (
                <>
                  <Check size={14} strokeWidth={3} />
                  <Sparkles 
                    size={10} 
                    className="absolute -top-0.5 -right-0.5 text-amber-400 animate-pulse" 
                  />
                </>
              )}
              {day.status === 'partial' && <Star size={12} fill="currentColor" />}
            </div>
            <span className={cn(
              "text-[10px]",
              day.isToday ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              {day.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyRitualStreak;
