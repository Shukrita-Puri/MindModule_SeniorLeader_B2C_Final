import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Check, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const WeeklyRitualStreak = () => {
  const { user } = useAuth();
  
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
        .select('ritual_date, completion_status')
        .eq('user_id', user.id)
        .gte('ritual_date', monday.toISOString().split('T')[0])
        .lte('ritual_date', sunday.toISOString().split('T')[0])
        .order('ritual_date', { ascending: true });
        
      if (error) throw error;
      
      // Map Monday-Sunday for this week
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const todayStr = today.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        
        const completion = data?.find(d => d.ritual_date === dateStr);
        const status = completion?.completion_status || 'skipped';
        
        weekDays.push({ date: dateStr, day: dayName, isToday, status });
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
    <div className="flex justify-between items-center gap-1 mb-4">
      {weeklyData?.map((day) => (
        <div key={day.date} className="flex flex-col items-center gap-1">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center transition-all",
            day.status === 'full' && "bg-saffron text-charcoal",
            day.status === 'partial' && "bg-amber-400 text-charcoal",
            day.status === 'skipped' && "border-2 border-border",
            day.isToday && "ring-2 ring-primary ring-offset-2"
          )}>
            {day.status === 'full' && <Check size={14} />}
            {day.status === 'partial' && <Minus size={14} />}
          </div>
          <span className="text-[10px] text-muted-foreground">{day.day}</span>
        </div>
      ))}
    </div>
  );
};

export default WeeklyRitualStreak;
