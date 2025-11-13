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
      if (!user?.id) return { change: 0, display: 'Stable' };
      
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance')
        .eq('user_id', user.id)
        .gte('checkin_date', fourteenDaysAgo.toISOString().split('T')[0])
        .order('checkin_date', { ascending: false });
        
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { change: 0, display: 'Stable' };
      }
      
      // Use available data (even if less than 7 days)
      const recentData = data.slice(0, Math.min(data.length, 7));
      const recentAvg = recentData.reduce((sum, d) => sum + (d.energy_balance || 50), 0) / recentData.length;
      
      // Use baseline from profile or first check-in as reference
      const baselineAvg = profile?.mental_fitness_baseline || data[data.length - 1]?.energy_balance || 50;
      
      const diff = Math.round(recentAvg - baselineAvg);
      
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
          <div className="flex flex-col items-center justify-end">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-lg font-bold text-orange-500">{current}</span>
              {getTrendIcon()}
              <MetricInfoModal
                title="Mental Fitness Score"
                description="Your overall self-regulation capacity (0-100). Tracks your ability to manage energy, focus, and emotional states. Higher scores indicate better regulation."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Mental Fitness</p>
          </div>

          {/* Peak Window */}
          <div className="flex flex-col items-center justify-end border-x border-border">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-lg font-bold text-orange-500">{peakWindowDisplay}</span>
              <MetricInfoModal
                title="Peak Performance Window"
                description="Your strongest time of day based on when you naturally complete practices and check-ins. Requires 21+ sessions to detect patterns."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Peak Performance</p>
          </div>

          {/* Energy Balance Trend */}
          <div className="flex flex-col items-center justify-end">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-lg font-bold text-orange-500">{balanceTrend?.display || '0'}</span>
              <MetricInfoModal
                title="Energy Balance Trend"
                description="7-day average energy balance trend. Compares this week vs last week. Shows if your regulation is improving (↑), declining (↓), or stable."
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Energy Trend</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightProgressCard;
