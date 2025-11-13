import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import WeeklyRitualStreak from './WeeklyRitualStreak';
import MetricInfoModal from './MetricInfoModal';
import { calculatePeakWindows } from '@/utils/engagementTracking';

const InsightProgressCard = () => {
  const { user } = useAuth();

  // Load onboarding data from database
  const { data: profile } = useQuery({
    queryKey: ['profile-onboarding', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('mental_fitness_baseline')
        .eq('id', user.id)
        .single();
        
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  // Calculate current Mental Fitness Score from activity
  const currentScore = calculateMentalFitnessScore();
  
  // Use baseline from database if available, otherwise use current calculated score
  const baseline = profile?.mental_fitness_baseline || currentScore.score;
  const current = currentScore.score;
  const change = current - baseline;

  // Calculate Peak Performance Window
  const { data: peakWindows } = useQuery({
    queryKey: ['peak-windows', user?.id],
    queryFn: async () => {
      const windows = await calculatePeakWindows();
      return windows;
    },
    enabled: !!user?.id
  });

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}${period}`;
  };

  const peakWindowDisplay = peakWindows && peakWindows.length > 0
    ? `${formatHour(peakWindows[0].startHour)}-${formatHour(peakWindows[0].endHour)}`
    : 'Detecting...';

  // Calculate Energy Balance Trend (7-day average)
  const { data: balanceTrend } = useQuery({
    queryKey: ['balance-trend', user?.id],
    queryFn: async () => {
      if (!user?.id) return { change: 0, display: 'Building baseline...' };
      
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance')
        .eq('user_id', user.id)
        .gte('checkin_date', fourteenDaysAgo.toISOString().split('T')[0])
        .order('checkin_date', { ascending: false });
        
      if (error) throw error;
      
      if (!data || data.length < 7) {
        return { change: 0, display: 'Building baseline...' };
      }
      
      // Calculate averages
      const recent7 = data.slice(0, 7).map(d => d.energy_balance || 50);
      const previous7 = data.slice(7, 14).map(d => d.energy_balance || 50);
      
      const recentAvg = recent7.reduce((a, b) => a + b, 0) / recent7.length;
      const previousAvg = previous7.length > 0 
        ? previous7.reduce((a, b) => a + b, 0) / previous7.length 
        : recentAvg;
      
      const diff = Math.round(recentAvg - previousAvg);
      
      if (Math.abs(diff) < 5) {
        return { change: 0, display: 'Stable' };
      }
      
      return {
        change: diff,
        display: `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)}`
      };
    },
    enabled: !!user?.id
  });
  
  const getTrendIcon = () => {
    if (change > 0) return <TrendingUp size={16} className="text-green-500" />;
    if (change < 0) return <TrendingDown size={16} className="text-amber-500" />;
    return <Minus size={16} className="text-muted-foreground" />;
  };
  
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      {/* Weekly Ritual Completion Visual */}
      <WeeklyRitualStreak />
      
      {/* Consolidated Metrics - 1 Line */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* Mental Fitness Score */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-2xl font-bold text-foreground">{current}</span>
              {getTrendIcon()}
              <MetricInfoModal
                title="Mental Fitness Score"
                description="Your overall self-regulation capacity (0-100). Tracks your ability to manage energy, focus, and emotional states. Higher scores indicate better regulation."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Score</p>
          </div>

          {/* Peak Window */}
          <div className="flex flex-col items-center border-x border-border">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm font-semibold text-foreground">{peakWindowDisplay}</span>
              <MetricInfoModal
                title="Peak Window"
                description="Your strongest time of day based on when you naturally complete practices and check-ins. Requires 21+ sessions to detect patterns."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Peak</p>
          </div>

          {/* Energy Balance Trend */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm font-semibold text-foreground">{balanceTrend?.display || 'Loading...'}</span>
              <MetricInfoModal
                title="Balance Trend"
                description="7-day average energy balance trend. Compares this week vs last week. Shows if your regulation is improving (↑), declining (↓), or stable."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Trend</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightProgressCard;
