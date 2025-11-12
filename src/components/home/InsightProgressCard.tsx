import { Flame, Target } from 'lucide-react';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const InsightProgressCard = () => {
  const { user } = useAuth();

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
  const mentalFitness = {
    score: profile?.mental_fitness_baseline || currentScore.score,
    trend: currentScore.trend
  };
  
  // Get streak and practices from localStorage (includes both Dialogue and Sanctuary)
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  const allPractices = practiceHistory.length + recalibrateHistory.length;
  const streak = getUserStreak();
  
  return (
    <div className="bg-card border border-gold/20 rounded-lg shadow-md p-4">
      {/* Three Elite Stats - Simplified */}
      <div className="grid grid-cols-3 gap-4">
        {/* Mental Fitness Score */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-2xl font-bold text-foreground">{mentalFitness.score}</span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <p className="text-xs text-muted-foreground">Mental Fitness</p>
        </div>
        
        {/* Practices Completed */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target size={16} className="text-primary" />
            <span className="text-2xl font-bold text-foreground">{allPractices}</span>
          </div>
          <p className="text-xs text-muted-foreground">Practices</p>
        </div>
        
        {/* Practice Streak */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame size={16} className="text-accent" />
            <span className="text-2xl font-bold text-foreground">{streak}</span>
          </div>
          <p className="text-xs text-muted-foreground">Day Streak</p>
        </div>
      </div>
    </div>
  );
};

// Helper function for streak calculation
function getUserStreak(): number {
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  if (practiceHistory.length === 0) return 0;
  
  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  while (true) {
    const hasActivity = practiceHistory.some((p: any) => {
      const pDate = new Date(p.timestamp);
      pDate.setHours(0, 0, 0, 0);
      return pDate.getTime() === currentDate.getTime();
    });
    
    if (hasActivity) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

export default InsightProgressCard;
