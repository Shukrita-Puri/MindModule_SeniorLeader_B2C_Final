import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, Play, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getTodayRitual, upsertRitual, type RitualData } from '@/utils/dailyRituals';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { useFavorites } from '@/hooks/useFavorites';
import { getActiveCoachInsights } from '@/utils/coachInsightsExtractor';

// Background images for Coach cards
import coachPrepareBackground from '@/assets/vibrant-executive-preparation.png';
import coachIntegrateBackground from '@/assets/ink-reflection-illustration.png';

// Coach card type for Prepare and Integrate modules
interface CoachCard {
  id: string;
  type: 'prepare' | 'integrate';
  label: string;
  protocolType: string;
  title: string;
  duration: number;
  sortOrder: number;
  isCoachCard: true;
  prompt: string;
}

// Helper to determine module type for Performance Plan display
const getModuleType = (practice: Recommendation): { 
  type: 'regulate' | 'align' | 'prepare' | 'integrate'; 
  label: string;
  protocolType: string;
  sortOrder: number;
} => {
  // Evening/integration practices
  const integrateTags = ['evening', 'integration', 'reflection', 'closure'];
  if (practice.tags?.some(tag => integrateTags.some(t => tag.toLowerCase().includes(t)))) {
    return { type: 'integrate', label: 'Integrate', protocolType: 'Coach', sortOrder: 4 };
  }
  
  // Prepare = pre-performance, rehearsal, visualization
  const prepareTags = ['pre-performance', 'rehearsal', 'visualization', 'preparation'];
  if (practice.tags?.some(tag => prepareTags.some(t => tag.toLowerCase().includes(t)))) {
    return { type: 'prepare', label: 'Prepare', protocolType: 'Coach', sortOrder: 3 };
  }
  
  // All soundbaths are Regulate (Somatic Protocol)
  if (practice.contentType === 'soundbath') {
    return { type: 'regulate', label: 'Regulate', protocolType: 'Somatic Protocol', sortOrder: 1 };
  }
  
  // Check if practice has 'somatic' in its tags
  if (practice.tags && practice.tags.some(tag => 
    tag.toLowerCase().includes('somatic') || 
    tag.toLowerCase().includes('breathing') ||
    tag.toLowerCase().includes('breathwork')
  )) {
    return { type: 'regulate', label: 'Regulate', protocolType: 'Somatic Protocol', sortOrder: 1 };
  }
  
  // Body-based guided practices
  const somaticGuidedPractices = [
    'trataka-flame-gaze',
    'energy-forge',
    'box-breathing',
    'kapalabhati-pranayama',
    'body-scan',
    'progressive-relaxation',
  ];
  
  if (practice.contentType === 'guided-practice' && somaticGuidedPractices.includes(practice.id)) {
    return { type: 'regulate', label: 'Regulate', protocolType: 'Somatic Protocol', sortOrder: 1 };
  }
  
  // Somatic micro-practices
  const somaticMicroPractices = [
    'grounding-touch',
    'physiological-sigh',
    'power-pose',
    'cold-exposure',
    'rhythmic-breathing'
  ];
  
  if (practice.contentType === 'micro-practice' && somaticMicroPractices.includes(practice.id)) {
    return { type: 'regulate', label: 'Regulate', protocolType: 'Somatic Protocol', sortOrder: 1 };
  }
  
  // Everything else is Align (Mindset Protocol)
  return { type: 'align', label: 'Align', protocolType: 'Mindset Protocol', sortOrder: 2 };
};

// Check if current time is evening (after 5pm)
const isEvening = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 17;
};

// Generate Coach cards for Prepare and Integrate
const generateCoachCards = (): CoachCard[] => {
  const cards: CoachCard[] = [];
  
  // Always include Prepare (Self Mastery Coach)
  cards.push({
    id: 'coach-prepare',
    type: 'prepare',
    label: 'Prepare',
    protocolType: 'Self Mastery Coach',
    title: 'Mental Rehearsal',
    duration: 2,
    sortOrder: 3,
    isCoachCard: true,
    prompt: "I have an important moment coming up. Help me mentally prepare and visualize success."
  });
  
  // Include Integrate only in evening (after 5pm)
  if (isEvening()) {
    cards.push({
      id: 'coach-integrate',
      type: 'integrate',
      label: 'Integrate',
      protocolType: 'Self Mastery Coach',
      title: 'Evening Flow',
      duration: 2,
      sortOrder: 4,
      isCoachCard: true,
      prompt: "Let's close out today. First, take a deep breath and let your shoulders drop. Now, what's one thing you did right today? Share your small win."
    });
  }
  
  return cards;
};

// Sort practices by module sequence: Regulate → Align → Prepare → Integrate
const sortPracticesBySequence = (practices: Recommendation[]): Recommendation[] => {
  return [...practices].sort((a, b) => {
    const orderA = getModuleType(a).sortOrder;
    const orderB = getModuleType(b).sortOrder;
    return orderA - orderB;
  });
};

const DailyRitual = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, isFavorite } = useFavorites();
  const [recommendations, setRecommendations] = useState<{
    practices: Recommendation[];
    recommendedCount: number;
    reasoning: string;
  }>({ practices: [], recommendedCount: 0, reasoning: '' });
  const [coachCards, setCoachCards] = useState<CoachCard[]>([]);
  const [loading, setLoading] = useState(true);
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
        flowType: card.type
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
    
    console.log('🎠 Carousel API initialized, drag enabled:', carouselApi.plugins());
    
    const onPointerDown = () => {
      console.log('🎠 Pointer down');
      setIsDragging(false);
    };
    const onPointerUp = () => {
      console.log('🎠 Pointer up');
      setTimeout(() => setIsDragging(false), 100);
    };
    const onScroll = () => {
      console.log('🎠 Scrolling/dragging');
      setIsDragging(true);
    };
    
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
      const newlyCompletedPractice = recommendations.practices.find(p => newlyCompletedIds.includes(p.id));
      const isRitualComplete = ritualStatus.status === 'completed';
      
      if (newlyCompletedPractice) {
        triggerCelebration(newlyCompletedPractice.title, isRitualComplete);
      }
    }
    
    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, ritualStatus.status, recommendations.practices]);

  const checkRitualCompletion = async () => {
    if (!user?.id) return;
    
    // Use edge function instead of direct Supabase call
    const data = await getTodayRitual();
    
    if (!data) {
      const actualCount = recommendations.practices.length || 0;
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: actualCount });
      setCompletedPracticeIds([]);
      return;
    }
    
    // Check completion using boolean fields (what the players update)
    const booleanCompletedCount = [
      data.soundscape_completed,
      data.guided_practice_completed,
      data.micro_exercise_completed
    ].filter(Boolean).length;
    
    // Also check completed_practice_ids array (for backward compatibility)
    const completedIds = data.completed_practice_ids || [];
    setCompletedPracticeIds(completedIds);
    
    const totalRecommended = data.recommended_practices_count || recommendations.recommendedCount || 3;
    
    // Use the higher of the two completion counts
    const effectiveCompletedCount = Math.max(booleanCompletedCount, completedIds.length);
    
    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    
    // Check database status first (most reliable)
    if (data.completion_status === 'full') {
      status = 'completed';
    } else if (effectiveCompletedCount >= totalRecommended && effectiveCompletedCount > 0) {
      status = 'completed';
      
      // Update the database status to 'full' if it's not already
      await upsertRitual({
        ritual_date: new Date().toISOString().split('T')[0],
        completion_status: 'full'
      });
    } else if (data.completion_status === 'partial' || effectiveCompletedCount > 0) {
      // Respect DB partial status even if counts are 0 due to sync issues
      status = 'partial';
    }
    
    console.log('[DailyRitual] Completion check:', {
      booleanCompletedCount,
      arrayCompletedCount: completedIds.length,
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
    const energyState = await computeEnergyState();
    const recs = await generateRecommendations(energyState);
    
    // Generate Coach cards (Prepare and Integrate)
    const cards = generateCoachCards();
    setCoachCards(cards);
    
    console.log('🎯 Daily Ritual Recommendations:', {
      practices: recs.practices.map(p => p.title),
      recommendedCount: recs.recommendedCount,
      actualCount: recs.practices.length,
      coachCards: cards.map(c => c.title)
    });
    
    setRecommendations(recs);
    setRitualStatus(prev => ({
      ...prev,
      totalCount: recs.recommendedCount
    }));
    setLoading(false);
  };

  const navigateToPractice = async (practice: Recommendation) => {
    // Set up the practice queue so completion tracking works
    const practices = recommendations.practices;
    localStorage.setItem('practiceQueue', JSON.stringify(practices.map(r => ({
      id: r.id,
      title: r.title,
      contentType: r.contentType,
      category: r.category,
      duration: r.duration
    }))));
    
    // Find the index of this practice in the queue
    const practiceIndex = practices.findIndex(p => p.id === practice.id);
    localStorage.setItem('queueIndex', String(practiceIndex >= 0 ? practiceIndex : 0));
    localStorage.setItem('ritualMode', 'true');

    // Ensure the ritual record exists in database via edge function
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
        completion_status: ritualStatus.status === 'not_started' ? 'partial' : ritualStatus.status,
        recommended_practices_count: recommendations.recommendedCount,
        recommended_practice_ids: practices.map(r => r.id),
      });
    }

    let route: string;
    if (practice.contentType === 'soundbath') {
      route = `/soundscapes/${practice.id}`;
    } else if (practice.contentType === 'guided-practice') {
      route = `/guided-practices/${practice.id}`;
    } else {
      route = `/micro-practice/${practice.id}/cards`;
    }
    
    navigate(route, { 
      state: { 
        category: practice.category,
        fromRitual: true 
      } 
    });
  };

  const handleMarkComplete = async (practiceId: string) => {
    if (!user?.id || completedPracticeIds.includes(practiceId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newCompletedIds = [...completedPracticeIds, practiceId];
    
    // Use edge function instead of direct Supabase call
    const result = await upsertRitual({
      ritual_date: today,
      completed_practice_ids: newCompletedIds,
      recommended_practice_ids: recommendations.practices.map(p => p.id),
      recommended_practices_count: recommendations.recommendedCount,
      completion_status: newCompletedIds.length >= recommendations.recommendedCount ? 'full' : 'partial'
    });
    
    if (result) {
      setCompletedPracticeIds(newCompletedIds);
      checkRitualCompletion();
    }
  };

  const handleStartRitual = async () => {
    const practices = recommendations.practices;
    if (practices.length === 0) return;

    localStorage.setItem('practiceQueue', JSON.stringify(practices.map(r => ({
      id: r.id,
      title: r.title,
      contentType: r.contentType,
      category: r.category,
      duration: r.duration
    }))));
    localStorage.setItem('queueIndex', '0');
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
        completion_status: 'partial',
        recommended_practices_count: recommendations.recommendedCount,
        recommended_practice_ids: practices.map(r => r.id),
        completed_practice_ids: []
      });
    }

    navigateToPractice(practices[0]);
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
      const practice = recommendations.practices.find(p => p.id === nextPractice.id);
      if (practice) {
        navigateToPractice(practice);
      }
    } else {
      handleStartRitual();
    }
  };

  const handleRestartRitual = async () => {
    // Note: Delete operation still uses direct Supabase as it requires special handling
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
      totalCount: recommendations.recommendedCount
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

  if (recommendations.practices.length === 0) {
    return (
      <div className="px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Unable to generate recommendations. Please complete your daily check-in.
        </p>
      </div>
    );
  }

  const sortedPractices = sortPracticesBySequence(recommendations.practices);

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
            {/* Practice-based modules */}
            {sortedPractices.map((practice) => {
              const isCompleted = completedPracticeIds.includes(practice.id);
              
              return (
                <CarouselItem 
                  key={practice.id} 
                  className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]"
                >
                  <div
                    onClick={() => !isDragging && !isCompleted && navigateToPractice(practice)}
                    className={cn(
                      "flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
                      isCompleted 
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5"
                    )}
                  >
                    {/* Thumbnail - fills height */}
                    <img 
                      src={practice.thumbnail} 
                      alt={practice.title}
                      className="w-32 h-full object-cover flex-shrink-0"
                    />
                    
                    {/* Content */}
                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                      {/* Module Type Label - stacked for better alignment */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium tracking-wide uppercase text-saffron font-body">
                          {getModuleType(practice).label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-body">
                          {getModuleType(practice).protocolType}
                        </span>
                      </div>
                      
                      {/* Title with favorite indicator */}
                      <div className="flex items-start gap-1 mt-1.5">
                        <h4 className="text-base font-semibold text-foreground line-clamp-2 leading-snug font-body flex-1">
                          {practice.title}
                        </h4>
                        {isFavorite(practice.id) && (
                          <Star size={12} className="text-saffron fill-saffron flex-shrink-0 mt-1" />
                        )}
                      </div>
                      
                      {/* Duration */}
                      <span className="text-xs text-muted-foreground mt-1.5 font-body">
                        {practice.duration} min
                      </span>
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
            
            {/* Coach cards (Prepare and Integrate) - same template as practice cards */}
            {coachCards.map((card, index) => {
              const isCompleted = completedPracticeIds.includes(card.id);
              const isLastCard = index === coachCards.length - 1;
              
              return (
                <CarouselItem 
                  key={card.id} 
                  className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]"
                >
                  <div
                    onClick={() => !isDragging && !isCompleted && navigateToCoach(card)}
                    className={cn(
                      // SAME base styles as practice cards
                      "flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
                      isCompleted 
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                      isLastCard && "mr-4"
                    )}
                  >
                    {/* Visual Area - Background image with SM monogram overlay */}
                    <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                      {/* Background image - same as practice cards */}
                      <img 
                        src={card.type === 'prepare' ? coachPrepareBackground : coachIntegrateBackground}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      
                      {/* Dark overlay for readability */}
                      <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/30 to-transparent" />
                      
                      {/* SM Coach monogram overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                        <span className="text-[8px] uppercase tracking-[0.2em] text-white/80 mt-1">Coach</span>
                      </div>
                    </div>
                    
                    {/* Content - SAME structure as practice cards */}
                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                      {/* Module Type Label - stacked */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium tracking-wide uppercase text-saffron font-body">
                          {card.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-body">
                          {card.protocolType}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <h4 className="text-base font-semibold text-foreground line-clamp-2 mt-1.5 leading-snug font-body">
                        {card.title}
                      </h4>
                      
                      {/* Duration */}
                      <span className="text-xs text-muted-foreground mt-1.5 font-body">
                        {card.duration} min
                      </span>
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
