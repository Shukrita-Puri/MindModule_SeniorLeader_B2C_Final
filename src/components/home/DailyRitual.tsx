import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, Play, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  generatePerformancePlan, 
  type ModuleRecommendation,
  type PlanContext,
  type CoachCard
} from '@/utils/performancePlanEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import { getTodayRitual, upsertRitual, type RitualData } from '@/utils/dailyRituals';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { useFavorites } from '@/hooks/useFavorites';
import { getActiveCoachInsights } from '@/utils/coachInsightsExtractor';
import { type SanctuaryContent } from '@/data/practicesAndSoundscapes';

// Background images for Coach cards
import coachPrepareBackground from '@/assets/vibrant-executive-preparation.png';
import coachIntegrateBackground from '@/assets/ink-reflection-illustration.png';

// Check if current time is evening (after 5pm)
const isEvening = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 17;
};

// Get time of day for performance plan
const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
};

// Type guard for coach cards
function isCoachCard(content: SanctuaryContent | CoachCard): content is CoachCard {
  return 'isCoachCard' in content && content.isCoachCard === true;
}

const DailyRitual = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, isFavorite } = useFavorites();
  const [recommendations, setRecommendations] = useState<ModuleRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCheckInOutcome, setCurrentCheckInOutcome] = useState<string | null>(null);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [ritualStatus, setRitualStatus] = useState<{
    status: 'not_started' | 'partial' | 'completed';
    completedCount: number;
    totalCount: number;
  }>({
    status: 'not_started',
    completedCount: 0,
    totalCount: 0
  });
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const prevCompletedIdsRef = useRef<string[]>([]);

  // Navigate to Coach with context
  const navigateToCoach = (card: CoachCard) => {
    navigate('/coach', {
      state: {
        initialPrompt: card.prompt,
        flowType: card.type,
        eventTitle: card.eventTitle
      }
    });
  };

  // Celebration effect when a new practice is completed
  const triggerCelebration = (practiceName: string, isRitualComplete: boolean) => {
    if (isRitualComplete) {
      // Big celebration for ritual completion - gold/saffron theme
      confetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.5 },
        colors: ['#D4AF37', '#F5D76E', '#FFD700', '#FFA500', '#E6C200']
      });
      // Second burst for extra celebration
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.7, x: 0.3 },
          colors: ['#D4AF37', '#F5D76E', '#FFD700']
        });
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.7, x: 0.7 },
          colors: ['#D4AF37', '#F5D76E', '#FFD700']
        });
      }, 200);
    } else {
      // Smaller celebration for individual practice completion
      confetti({
        particleCount: 60,
        spread: 50,
        origin: { y: 0.6 },
        colors: ['#D4AF37', '#8B7355', '#A9957B']
      });
    }

    // Show toast
    toast({
      title: isRitualComplete ? "Ritual Complete!" : "Practice Complete!",
      description: isRitualComplete 
        ? "Amazing work! You've completed your daily ritual."
        : `Great job completing "${practiceName}"!`,
    });
  };

  useEffect(() => {
    if (!carouselApi) return;
    setSlideCount(carouselApi.scrollSnapList().length);
    setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on("select", () => setCurrentSlide(carouselApi.selectedScrollSnap()));
  }, [carouselApi]);

  // Track dragging state to prevent click navigation while swiping
  useEffect(() => {
    if (!carouselApi) return;
    
    const onPointerDown = () => setIsDragging(false);
    const onPointerUp = () => setTimeout(() => setIsDragging(false), 100);
    const onScroll = () => setIsDragging(true);
    
    carouselApi.on('pointerDown', onPointerDown);
    carouselApi.on('pointerUp', onPointerUp);
    carouselApi.on('scroll', onScroll);
    
    return () => {
      carouselApi.off('pointerDown', onPointerDown);
      carouselApi.off('pointerUp', onPointerUp);
      carouselApi.off('scroll', onScroll);
    };
  }, [carouselApi]);

  useEffect(() => {
    loadRecommendations();
    checkRitualCompletion();
    
    const interval = setInterval(() => {
      checkRitualCompletion();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [user?.id]);

  // Detect newly completed practices and trigger celebration
  useEffect(() => {
    const prevIds = prevCompletedIdsRef.current;
    const newlyCompletedIds = completedPracticeIds.filter(id => !prevIds.includes(id));
    
    if (newlyCompletedIds.length > 0 && prevIds.length > 0) {
      // Find the practice name for the toast
      const newlyCompletedModule = recommendations.find(r => newlyCompletedIds.includes(r.content.id));
      const isRitualComplete = ritualStatus.status === 'completed';
      
      if (newlyCompletedModule) {
        const title = isCoachCard(newlyCompletedModule.content) 
          ? newlyCompletedModule.content.title 
          : newlyCompletedModule.content.title;
        triggerCelebration(title, isRitualComplete);
      }
    }
    
    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, ritualStatus.status, recommendations]);

  const checkRitualCompletion = async () => {
    if (!user?.id) return;
    
    const data = await getTodayRitual();
    
    if (!data) {
      const actualCount = recommendations.length || 0;
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: actualCount });
      setCompletedPracticeIds([]);
      return;
    }
    
    // Check completion using boolean fields
    const booleanCompletedCount = [
      data.soundscape_completed,
      data.guided_practice_completed,
      data.micro_exercise_completed
    ].filter(Boolean).length;
    
    const completedIds = data.completed_practice_ids || [];
    setCompletedPracticeIds(completedIds);
    
    const totalRecommended = data.recommended_practices_count || recommendations.length || 3;
    const effectiveCompletedCount = Math.max(booleanCompletedCount, completedIds.length);
    
    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    
    if (data.completion_status === 'full') {
      status = 'completed';
    } else if (effectiveCompletedCount >= totalRecommended && effectiveCompletedCount > 0) {
      status = 'completed';
      await upsertRitual({
        ritual_date: new Date().toISOString().split('T')[0],
        completion_status: 'full'
      });
    } else if (data.completion_status === 'partial' || effectiveCompletedCount > 0) {
      status = 'partial';
    }
    
    console.log('[DailyRitual] Completion check:', {
      effectiveCompletedCount,
      totalRecommended,
      dbStatus: data.completion_status,
      finalStatus: status
    });
    
    setRitualStatus({
      status,
      completedCount: effectiveCompletedCount,
      totalCount: totalRecommended
    });
  };

  const loadRecommendations = async () => {
    setLoading(true);
    
    try {
      // 1. Get energy state
      const energyState = await computeEnergyState(user?.id);
      
      // Store check-in outcome for UI (e.g., "After grounding" badge on scattered Coach cards)
      setCurrentCheckInOutcome(energyState.checkInOutcome || null);
      
      // 2. Get theme from energy state
      const theme = getStrategicTheme(
        energyState.energyTier,
        energyState.calendarLoad,
        energyState.calendarPressure,
        energyState.timeOfDay,
        energyState.checkInOutcome
      );
      
      // 3. Get user favorites (convert Map to array of content IDs)
      const favoriteIds = Array.from(favorites.keys());
      
      // 4. Get coach insights
      const coachInsights = user?.id ? await getActiveCoachInsights(user.id) : [];
      
      // 5. Get completed practice IDs for today
      const todayRitual = await getTodayRitual();
      const completedToday = todayRitual?.completed_practice_ids || [];
      
      // 6. Build plan context
      const context: PlanContext = {
        energyTier: energyState.energyTier,
        checkInOutcome: energyState.checkInOutcome || 'steady',
        timeOfDay: getTimeOfDay(),
        themePhrase: theme.phrase,
        themeDriver: theme.driver || 'state',
        favorites: favoriteIds,
        coachInsights: coachInsights.map(i => ({
          id: i.id,
          type: i.type,
          content: i.content,
          contentReference: i.contentReference,
          confidence: i.confidence,
          extractedAt: i.extractedAt
        })),
        completedToday,
        effectiveContent: [], // Could pull from history
        calendarPressure: energyState.calendarPressure,
        calendarLoad: energyState.calendarLoad
      };
      
      // 7. Generate performance plan (capped at 3-4 modules)
      const plan = generatePerformancePlan(context);
      
      console.log('🎯 Performance Plan Generated:', {
        themePhrase: theme.phrase,
        modules: plan.map(m => ({
          type: m.type,
          title: isCoachCard(m.content) ? m.content.title : m.content.title,
          required: m.required
        })),
        totalModules: plan.length
      });
      
      setRecommendations(plan);
      setRitualStatus(prev => ({
        ...prev,
        totalCount: plan.length
      }));
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }
    
    setLoading(false);
  };

  const navigateToPractice = async (module: ModuleRecommendation) => {
    const content = module.content;
    
    // Set up the practice queue so completion tracking works
    localStorage.setItem('practiceQueue', JSON.stringify(recommendations.map(r => ({
      id: r.content.id,
      title: isCoachCard(r.content) ? r.content.title : r.content.title,
      contentType: isCoachCard(r.content) ? 'coach' : r.content.contentType,
      category: isCoachCard(r.content) ? 'coach' : r.content.category,
      duration: isCoachCard(r.content) ? r.content.duration : r.content.duration
    }))));
    
    const practiceIndex = recommendations.findIndex(r => r.content.id === content.id);
    localStorage.setItem('queueIndex', String(practiceIndex >= 0 ? practiceIndex : 0));
    localStorage.setItem('ritualMode', 'true');

    // Ensure the ritual record exists
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
        completion_status: ritualStatus.status === 'not_started' ? 'partial' : ritualStatus.status,
        recommended_practices_count: recommendations.length,
        recommended_practice_ids: recommendations.map(r => r.content.id),
      });
    }

    // Handle coach cards
    if (isCoachCard(content)) {
      navigateToCoach(content);
      return;
    }

    // Navigate to practice
    let route: string;
    if (content.contentType === 'soundbath') {
      route = `/soundscapes/${content.id}`;
    } else if (content.contentType === 'guided-practice') {
      route = `/guided-practices/${content.id}`;
    } else {
      route = `/micro-practice/${content.id}/cards`;
    }
    
    navigate(route, { 
      state: { 
        category: content.category,
        fromRitual: true 
      } 
    });
  };

  const handleMarkComplete = async (practiceId: string) => {
    if (!user?.id || completedPracticeIds.includes(practiceId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newCompletedIds = [...completedPracticeIds, practiceId];
    
    const result = await upsertRitual({
      ritual_date: today,
      completed_practice_ids: newCompletedIds,
      recommended_practice_ids: recommendations.map(r => r.content.id),
      recommended_practices_count: recommendations.length,
      completion_status: newCompletedIds.length >= recommendations.length ? 'full' : 'partial'
    });
    
    if (result) {
      setCompletedPracticeIds(newCompletedIds);
      checkRitualCompletion();
    }
  };

  const handleStartRitual = async () => {
    if (recommendations.length === 0) return;

    localStorage.setItem('practiceQueue', JSON.stringify(recommendations.map(r => ({
      id: r.content.id,
      title: isCoachCard(r.content) ? r.content.title : r.content.title,
      contentType: isCoachCard(r.content) ? 'coach' : r.content.contentType,
      category: isCoachCard(r.content) ? 'coach' : r.content.category,
      duration: isCoachCard(r.content) ? r.content.duration : r.content.duration
    }))));
    localStorage.setItem('queueIndex', '0');
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
        completion_status: 'partial',
        recommended_practices_count: recommendations.length,
        recommended_practice_ids: recommendations.map(r => r.content.id),
        completed_practice_ids: []
      });
    }

    navigateToPractice(recommendations[0]);
  };

  const handleContinueRitual = async () => {
    const queue = localStorage.getItem('practiceQueue');
    if (!queue) {
      handleStartRitual();
      return;
    }

    const queueData = JSON.parse(queue);
    const currentIndex = parseInt(localStorage.getItem('queueIndex') || '0');
    
    if (currentIndex < queueData.length) {
      const nextPractice = queueData[currentIndex];
      const module = recommendations.find(r => r.content.id === nextPractice.id);
      if (module) {
        navigateToPractice(module);
      }
    } else {
      handleStartRitual();
    }
  };

  const handleRestartRitual = async () => {
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_ritual_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('ritual_date', today);
    }
    
    localStorage.removeItem('practiceQueue');
    localStorage.removeItem('queueIndex');
    localStorage.removeItem('ritualMode');
    
    setRitualStatus({
      status: 'not_started',
      completedCount: 0,
      totalCount: recommendations.length
    });
    await loadRecommendations();
  };

  if (loading) {
    return (
      <div className="px-4 py-5">
        <div className="space-y-3">
          <div className="h-4 bg-muted/30 animate-pulse rounded-lg" />
          <div className="h-4 bg-muted/30 animate-pulse rounded-lg w-3/4" />
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Unable to generate recommendations. Please complete your daily check-in.
        </p>
      </div>
    );
  }

  // Get module label and protocol type
  const getModuleDisplay = (module: ModuleRecommendation) => {
    const labels: Record<string, string> = {
      regulate: 'Regulate',
      align: 'Align',
      prepare: 'Prepare',
      integrate: 'Integrate'
    };
    
    const protocolTypes: Record<string, string> = {
      regulate: 'Somatic Protocol',
      align: 'Mindset Protocol',
      prepare: 'Self Mastery Coach',
      integrate: 'Self Mastery Coach'
    };
    
    return {
      label: labels[module.type],
      protocolType: protocolTypes[module.type]
    };
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Progress indicator - compact */}
      {ritualStatus.status === 'partial' && (
        <div className="text-xs text-muted-foreground px-4 max-w-lg mx-auto">
          {ritualStatus.completedCount} of {ritualStatus.totalCount} modules completed
        </div>
      )}

      {/* Recommended Content - Full Width Carousel */}
      <div className="relative w-full">
        <Carousel 
          opts={{ align: 'start', loop: false, watchDrag: true }} 
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent className="-ml-3 pl-4 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'pan-y' }}>
            {recommendations.map((module, index) => {
              const content = module.content;
              const isCompleted = completedPracticeIds.includes(content.id);
              const isCoach = isCoachCard(content);
              const display = getModuleDisplay(module);
              const isLastCard = index === recommendations.length - 1;
              
              return (
                <CarouselItem 
                  key={content.id} 
                  className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]"
                >
                  <div
                    onClick={() => !isDragging && !isCompleted && navigateToPractice(module)}
                    className={cn(
                      "flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
                      isCompleted 
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                      isLastCard && "mr-4"
                    )}
                  >
                    {/* Thumbnail / Visual */}
                    {isCoach ? (
                      <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                        <img 
                          src={content.type === 'prepare' ? coachPrepareBackground : coachIntegrateBackground}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/30 to-transparent" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                          <span className="text-[8px] uppercase tracking-[0.2em] text-white/80 mt-1">Coach</span>
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={(content as SanctuaryContent).thumbnail} 
                        alt={(content as SanctuaryContent).title}
                        className="w-32 h-full object-cover flex-shrink-0"
                      />
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                      {/* Module Type Label - stacked */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium tracking-wide uppercase text-saffron font-body">
                          {display.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-body">
                          {display.protocolType}
                        </span>
                      </div>
                      
                      {/* Title with favorite indicator */}
                      <div className="flex items-start gap-1 mt-1.5">
                        <h4 className="text-base font-semibold text-foreground line-clamp-2 leading-snug font-body flex-1">
                          {isCoach ? content.title : (content as SanctuaryContent).title}
                        </h4>
                        {!isCoach && isFavorite(content.id) && (
                          <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                      
                      {/* Duration */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground font-body">
                          {isCoach ? content.duration : (content as SanctuaryContent).duration} min
                        </span>
                      </div>
                    </div>
                    
                    {/* Completed Check */}
                    {isCompleted && (
                      <div className="w-8 h-8 rounded-full bg-saffron flex items-center justify-center mr-3 flex-shrink-0 self-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
        
        {/* Swipe hint gradient - mobile only */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
      </div>

      {/* Pagination Dots */}
      {slideCount > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: slideCount }).map((_, index) => (
            <button
              key={index}
              onClick={() => carouselApi?.scrollTo(index)}
              className={cn(
                "h-2 rounded-full transition-all",
                index === currentSlide 
                  ? "bg-primary w-4" 
                  : "bg-muted-foreground/30 w-2"
              )}
            />
          ))}
        </div>
      )}

      {/* Action Button */}
      <div className="px-4 max-w-lg mx-auto">
        {ritualStatus.status === 'not_started' && (
          <Button 
            onClick={handleStartRitual}
            className="w-full h-12 text-base font-semibold bg-saffron text-charcoal hover:bg-saffron/90 rounded-xl shadow-[0_4px_16px_rgba(255,140,66,0.25)]"
          >
            <Play size={16} className="mr-2" />
            Start Today's Flow
          </Button>
        )}

        {ritualStatus.status === 'partial' && (
          <Button 
            onClick={handleContinueRitual}
            className="w-full h-12 text-base font-semibold bg-saffron text-charcoal hover:bg-saffron/90 rounded-xl shadow-[0_4px_16px_rgba(255,140,66,0.25)]"
          >
            <Play size={16} className="mr-2" />
            Continue Flow
          </Button>
        )}

        {ritualStatus.status === 'completed' && (
          <div className="flex items-center gap-2">
            <Button 
              disabled
              className="flex-1 h-12 text-base font-semibold bg-taupe/80 text-white rounded-xl cursor-default"
            >
              <Check size={18} className="mr-2" />
              Completed
            </Button>
            <Button
              onClick={handleRestartRitual}
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl border-taupe/30 hover:bg-taupe/10"
              title="Restart Ritual"
            >
              <RotateCcw size={18} className="text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyRitual;
