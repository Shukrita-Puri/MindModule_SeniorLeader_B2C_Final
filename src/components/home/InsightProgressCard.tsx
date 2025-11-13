import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import WeeklyRitualStreak from './WeeklyRitualStreak';

const InsightProgressCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Load onboarding data from database
  const { data: profile } = useQuery({
    queryKey: ['profile-onboarding', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('mental_fitness_baseline, user_archetype, growth_priority, biggest_pressure')
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
  
  // Calculate consistency rate (this week)
  const { data: weeklyCompletions } = useQuery({
    queryKey: ['weekly-consistency', user?.id],
    queryFn: async () => {
      if (!user?.id) return { rate: 0, streak: 0 };
      
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      
      const { data, error } = await supabase
        .from('daily_ritual_completions')
        .select('completion_status')
        .eq('user_id', user.id)
        .gte('ritual_date', sevenDaysAgo.toISOString().split('T')[0]);
        
      if (error) throw error;
      
      const completed = data?.filter(d => d.completion_status === 'full').length || 0;
      const rate = Math.round((completed / 7) * 100);
      
      // Calculate current streak
      let streak = 0;
      const { data: streakData } = await supabase
        .from('daily_ritual_completions')
        .select('ritual_date, completion_status')
        .eq('user_id', user.id)
        .order('ritual_date', { ascending: false })
        .limit(30);
      
      if (streakData) {
        for (const day of streakData) {
          if (day.completion_status === 'full') {
            streak++;
          } else {
            break;
          }
        }
      }
      
      return { rate, streak };
    },
    enabled: !!user?.id
  });
  
  const getTrendIcon = () => {
    if (change > 0) return <TrendingUp size={16} className="text-green-500" />;
    if (change < 0) return <TrendingDown size={16} className="text-amber-500" />;
    return <Minus size={16} className="text-muted-foreground" />;
  };
  
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      {/* Weekly Ritual Completion Visual */}
      <WeeklyRitualStreak />
      
      {/* Mental Fitness Score - Prominent */}
      <div className="text-center mb-6 pb-6 border-b border-border">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-4xl font-bold text-foreground">{current}</span>
          <span className="text-sm font-light text-muted-foreground">/100</span>
          {getTrendIcon()}
        </div>
        <p className="text-xs text-muted-foreground mb-1">Mental Fitness Score</p>
        <p className="text-xs font-medium text-primary">
          {change > 0 ? '+' : ''}{change} from baseline
        </p>
      </div>
      
      {/* Supporting Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Consistency Rate */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-2xl font-bold text-foreground">{weeklyCompletions?.rate || 0}</span>
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">Consistency</p>
        </div>
        
        {/* Current Streak */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock size={16} className="text-saffron" />
            <span className="text-2xl font-bold text-foreground">{weeklyCompletions?.streak || 0}</span>
          </div>
          <p className="text-xs text-muted-foreground">Day Streak</p>
        </div>
      </div>
      
      {/* Link to Detailed Insights */}
      <button
        onClick={() => navigate('/insights-dashboard')}
        className="w-full text-xs text-muted-foreground hover:text-primary transition-colors text-center"
      >
        View detailed insights →
      </button>
    </div>
  );
};

export default InsightProgressCard;
