import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, Circle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const WeeklyRitualStreak = () => {
  const { user } = useAuth();
  
  const { data: weeklyData, isLoading } = useQuery({
    queryKey: ['weekly-ritual-streak', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Get last 7 days of ritual completions
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      
      const { data, error } = await supabase
        .from('daily_ritual_completions')
        .select('ritual_date, completion_status')
        .eq('user_id', user.id)
        .gte('ritual_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('ritual_date', { ascending: true });
        
      if (error) throw error;
      
      // Create array for last 7 days with completion status
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
        const isToday = i === 0;
        
        const completion = data?.find(d => d.ritual_date === dateStr);
        
        last7Days.push({
          date: dateStr,
          day: dayName,
          isToday,
          status: completion?.completion_status || 'skipped'
        });
      }
      
      return last7Days;
    },
    enabled: !!user?.id
  });

  if (isLoading) {
    return (
      <div className="flex justify-between items-center gap-2 mb-4">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-3 w-4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center gap-2 mb-6">
      {weeklyData?.map((day) => (
        <div key={day.date} className="flex flex-col items-center gap-1.5">
          <div className={`
            relative h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300
            ${day.status === 'full' 
              ? 'bg-saffron text-background shadow-[0_0_20px_rgba(217,173,96,0.3)]' 
              : day.status === 'partial'
              ? 'bg-amber-500/30 border-2 border-amber-500/50'
              : 'bg-background border-2 border-border'
            }
            ${day.isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
          `}>
            {day.status === 'full' ? (
              <CheckCircle2 size={20} strokeWidth={2.5} />
            ) : (
              <Circle size={20} strokeWidth={1.5} className="text-muted-foreground" />
            )}
          </div>
          <span className={`text-xs font-medium ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
            {day.day}
          </span>
        </div>
      ))}
    </div>
  );
};

export default WeeklyRitualStreak;
