import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, TrendingUp, TrendingDown, Minus, Flame, Brain, Target } from 'lucide-react';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export function MentalFitnessScoreCard() {
  const { user } = useAuth();
  
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('mentalFitnessCard-collapsed');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [fitnessData, setFitnessData] = useState(() => calculateMentalFitnessScore());

  // Load profile data from database (primary source)
  const { data: profile } = useQuery({
    queryKey: ['profile-insights', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          mental_fitness_baseline,
          user_archetype,
          growth_priority,
          biggest_pressure,
          component_scores,
          identity_role
        `)
        .eq('id', user.id)
        .maybeSingle();
        
      if (error) {
        console.error('Error loading profile:', error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id
  });

  // Prepare archetype data from database or localStorage fallback
  const archetypeData = profile?.user_archetype ? {
    archetype: typeof profile.user_archetype === 'string' 
      ? JSON.parse(profile.user_archetype) 
      : profile.user_archetype,
    componentScores: profile.component_scores,
    growthArea: profile.growth_priority,
    recommendedMastery: extractRecommendedMastery(profile.growth_priority),
    baseline: profile.mental_fitness_baseline,
    biggestPressure: profile.biggest_pressure,
    role: profile.identity_role
  } : null;

  useEffect(() => {
    setFitnessData(calculateMentalFitnessScore());
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('mentalFitnessCard-collapsed', JSON.stringify(newState));
  };

  const getTrendIcon = () => {
    if (fitnessData.trend === 'up') return <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-500" />;
    if (fitnessData.trend === 'down') return <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />;
    return <Minus className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />;
  };

  const getTrendText = () => {
    // Use database baseline if available, otherwise use changeFromBaseline
    if (profile?.mental_fitness_baseline) {
      const baseline = profile.mental_fitness_baseline;
      const currentScore = fitnessData.score;
      const change = currentScore - baseline;
      
      if (change === 0) return 'from baseline';
      const sign = change > 0 ? '+' : '';
      return `${sign}${change} from baseline`;
    }
    
    // Fallback to calculated change
    if (fitnessData.changeFromBaseline === 0) return 'from baseline';
    const sign = fitnessData.changeFromBaseline > 0 ? '+' : '';
    return `${sign}${fitnessData.changeFromBaseline} from baseline`;
  };

  return (
    <Card className="bg-card border-border">
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <div className="p-4 md:p-6">
          <CollapsibleTrigger className="w-full flex items-center justify-between group">
            <div className="text-left">
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                Mental Fitness Score
              </h2>
              {!fitnessData.isInBaselinePeriod && (
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  Your behavioral consistency index
                </p>
              )}
            </div>
            <ChevronDown 
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-6 space-y-6">
              {fitnessData.isInBaselinePeriod ? (
                <div className="text-center space-y-4">
                  <div>
                    <p className="text-sm md:text-base text-muted-foreground mb-2">
                      Building your baseline...
                    </p>
                    <p className="text-2xl md:text-4xl font-headline text-foreground">
                      Day {fitnessData.daysInBaseline}/7
                    </p>
                  </div>
                  
                  <div className="max-w-md mx-auto">
                    <Progress value={(fitnessData.daysInBaseline / 7) * 100} className="h-3" />
                  </div>
                  
                  <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
                    Complete check-ins and rituals for 7 days to establish your personal baseline score
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Score Display */}
                  <div className="text-center space-y-2">
                    <div className="relative inline-block">
                      <svg className="w-32 h-32 md:w-40 md:h-40" viewBox="0 0 160 160">
                        {/* Background circle */}
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="12"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeDasharray={`${(fitnessData.score / 100) * 439.6} 439.6`}
                          transform="rotate(-90 80 80)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl md:text-5xl font-headline text-foreground">
                          {fitnessData.score}
                        </span>
                        <span className="text-sm md:text-base text-muted-foreground">/100</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-2 text-sm md:text-base">
                      {getTrendIcon()}
                      <span className="text-muted-foreground">{getTrendText()}</span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Current Streak */}
                    <div className="bg-background/50 rounded-lg p-4 text-center border border-border/50">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Flame className="h-5 w-5 text-orange-500" />
                        <span className="text-2xl md:text-3xl font-headline text-foreground">
                          {fitnessData.currentStreak}
                        </span>
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground">Day Streak</p>
                    </div>

                    {/* Weekly Rituals */}
                    <div className="bg-background/50 rounded-lg p-4 text-center border border-border/50">
                      <p className="text-2xl md:text-3xl font-headline text-foreground mb-1">
                        {fitnessData.ritualsThisWeek.completed}/{fitnessData.ritualsThisWeek.total}
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground">Rituals This Week</p>
                    </div>
                  </div>

                  {/* Section B: Your Profile Insights (from database) */}
                  {archetypeData && archetypeData.archetype && (
                    <div className="bg-gradient-to-br from-primary/5 to-gold/5 rounded-lg p-4 border border-border space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm md:text-base font-semibold mb-1">
                            You're a {archetypeData.archetype.title}
                          </h4>
                          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                            {archetypeData.archetype.description}
                          </p>
                          {archetypeData.baseline && (
                            <p className="text-xs text-gold mt-2">
                              Day 1 Baseline: {archetypeData.baseline}/100
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <div className="flex items-start gap-2">
                          <Target className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                          <div className="space-y-2 flex-1">
                            <div>
                              <div className="text-xs md:text-sm font-medium mb-1">Your Growth Priority</div>
                              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                                {archetypeData.growthArea}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {getEvolvingGrowthInsight(archetypeData, fitnessData, profile?.mental_fitness_baseline)}
                              </p>
                            </div>
                            
                            {archetypeData.recommendedMastery && (
                              <div className="pt-2 border-t border-border/50">
                                <div className="text-xs md:text-sm font-medium mb-1">Recommended Focus</div>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  {archetypeData.recommendedMastery} Mastery practices
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {getMasteryDescription(archetypeData.recommendedMastery)}
                                </p>
                              </div>
                            )}

                            {archetypeData.biggestPressure && (
                              <div className="pt-2 border-t border-border/50">
                                <div className="text-xs md:text-sm font-medium mb-1">Your Context</div>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  {archetypeData.role && `${archetypeData.role} facing `}
                                  {archetypeData.biggestPressure}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!archetypeData && (
                    <div className="bg-muted/30 rounded-lg p-4 text-center border border-border/30">
                      <p className="text-xs md:text-sm text-muted-foreground">
                        Complete your onboarding to see personalized insights
                      </p>
                    </div>
                  )}

                  {/* Score Breakdown */}
                  <div className="bg-background/30 rounded-lg p-4 space-y-2 border border-border/30">
                    <p className="text-xs md:text-sm font-medium text-foreground mb-3">
                      Score Components
                    </p>
                    <div className="space-y-2 text-xs md:text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Daily Ritual Completion</span>
                        <span className="text-foreground font-medium">40%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Check-in Consistency</span>
                        <span className="text-foreground font-medium">30%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Content Engagement</span>
                        <span className="text-foreground font-medium">20%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Active Streak Bonus</span>
                        <span className="text-foreground font-medium">10%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </Card>
  );
}

// Helper function to extract recommended mastery from growth priority text
function extractRecommendedMastery(growthPriority: string | null): string {
  if (!growthPriority) return 'Pause';
  
  const lower = growthPriority.toLowerCase();
  if (lower.includes('composure') || lower.includes('calm') || lower.includes('pause')) {
    return 'Pause';
  } else if (lower.includes('focus') || lower.includes('concentration') || lower.includes('flow')) {
    return 'Flow';
  } else if (lower.includes('energy') || lower.includes('renewal') || lower.includes('activation')) {
    return 'Renewal';
  }
  return 'Pause';
}

// Helper function to provide evolving growth insights based on current performance
function getEvolvingGrowthInsight(archetypeData: any, fitnessData: any, baseline?: number): string {
  const currentScore = fitnessData.score;
  const baselineScore = baseline || archetypeData.baseline;
  const progressFromBaseline = baselineScore ? currentScore - baselineScore : fitnessData.changeFromBaseline;
  
  if (progressFromBaseline >= 10) {
    return `Excellent progress! You're +${progressFromBaseline} from baseline. Focus on consistency to sustain momentum.`;
  } else if (progressFromBaseline >= 5) {
    return `Building momentum: +${progressFromBaseline} from baseline. Keep practicing core techniques to accelerate growth.`;
  } else if (progressFromBaseline >= 0) {
    return progressFromBaseline === 0 
      ? `At baseline. Consistency in daily rituals will unlock the next level.`
      : `Small gains: +${progressFromBaseline} from baseline. Stay consistent with daily practices.`;
  } else {
    return `${progressFromBaseline} from baseline. Return to foundational practices and rebuild daily rhythm.`;
  }
}

function getMasteryDescription(mastery: string): string {
  const descriptions: Record<string, string> = {
    'Pause': 'Build composure and tactical downshift capabilities',
    'Flow': 'Develop sustained focus and cognitive endurance',
    'Renewal': 'Master energy restoration and activation techniques'
  };
  return descriptions[mastery] || 'Build foundational self-regulation skills';
}
