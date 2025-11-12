import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, TrendingUp, TrendingDown, Minus, Flame, Brain, Target } from 'lucide-react';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';

export function MentalFitnessScoreCard() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('mentalFitnessCard-collapsed');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [fitnessData, setFitnessData] = useState(() => calculateMentalFitnessScore());
  
  // Get onboarding archetype and component scores
  const [archetypeData, setArchetypeData] = useState<any>(null);

  useEffect(() => {
    setFitnessData(calculateMentalFitnessScore());
    
    // Load archetype data from onboarding
    const onboardingSession = JSON.parse(localStorage.getItem('mind_module_onboarding') || '{}');
    if (onboardingSession.responses) {
      setArchetypeData({
        archetype: onboardingSession.responses.user_archetype,
        componentScores: onboardingSession.responses.component_scores,
        growthArea: onboardingSession.responses.growth_area,
        recommendedMastery: onboardingSession.responses.recommended_mastery,
        baseline: onboardingSession.responses.mental_fitness_baseline
      });
    }
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

                  {/* Section B: Your Profile Insights (from onboarding) */}
                  {archetypeData && archetypeData.archetype && (
                    <div className="bg-gradient-to-br from-primary/5 to-gold/5 rounded-lg p-4 border border-border space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold mb-1">You're a {archetypeData.archetype.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {archetypeData.archetype.description}
                          </p>
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <div className="flex items-start gap-2">
                          <Target className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                          <div className="space-y-2 flex-1">
                            <div>
                              <div className="text-xs font-medium mb-1">Your Growth Edge</div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {archetypeData.growthArea} - {getEvolvingGrowthInsight(archetypeData, fitnessData)}
                              </p>
                            </div>
                            
                            <div className="pt-2 border-t border-border/50">
                              <div className="text-xs font-medium mb-1">Recommended Focus</div>
                              <p className="text-xs text-muted-foreground">
                                {archetypeData.recommendedMastery} Mastery practices - {getMasteryDescription(archetypeData.recommendedMastery)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
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

// Helper function to provide evolving growth insights based on current performance
function getEvolvingGrowthInsight(archetypeData: any, fitnessData: any): string {
  const progressFromBaseline = fitnessData.changeFromBaseline;
  const growthArea = archetypeData.growthArea;
  
  if (progressFromBaseline >= 10) {
    return `Excellent progress! Your ${growthArea} skills are developing rapidly. Focus on consistency to sustain this momentum.`;
  } else if (progressFromBaseline >= 5) {
    return `You're building momentum in ${growthArea}. Keep practicing your core techniques to accelerate growth.`;
  } else if (progressFromBaseline >= 0) {
    return `Focus on ${growthArea} practices to move beyond your baseline. Consistency in daily rituals will unlock the next level.`;
  } else {
    return `Your ${growthArea} needs more attention. Return to foundational practices and rebuild your daily rhythm.`;
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
