import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
// Helper to determine protocol type based on practice characteristics
const getProtocolType = (practice: Recommendation): string => {
  // All soundbaths are Somatic Protocol
  if (practice.contentType === 'soundbath') {
    return 'Somatic Protocol';
  }
  
  // Check if practice has 'somatic' in its tags (explicit marker)
  if (practice.tags && practice.tags.some(tag => 
    tag.toLowerCase().includes('somatic') || 
    tag.toLowerCase().includes('breathing') ||
    tag.toLowerCase().includes('breathwork')
  )) {
    return 'Somatic Protocol';
  }
  
  // Body-based guided practices (yogic, physical, sensory)
  const somaticGuidedPractices = [
    'trataka-flame-gaze', // Yogic gazing meditation
    'energy-forge', // Physical activation
    'box-breathing', // Breathwork
    'kapalabhati-pranayama', // Breathwork
    'body-scan', // Body awareness
    'progressive-relaxation', // Body-based
  ];
  
  if (practice.contentType === 'guided-practice' && somaticGuidedPractices.includes(practice.id)) {
    return 'Somatic Protocol';
  }
  
  // For micro-practices, check if they're tools (somatic) vs mindset
  // Tools are body-based techniques, mindset are cognitive reframes
  const somaticMicroPractices = [
    'grounding-touch',
    'physiological-sigh',
    'power-pose',
    'cold-exposure',
    'rhythmic-breathing'
  ];
  
  if (practice.contentType === 'micro-practice' && somaticMicroPractices.includes(practice.id)) {
    return 'Somatic Protocol';
  }
  
  // Everything else is Mindset Protocol (cognitive reframing, visualization, mental models)
  return 'Mindset Protocol';
};

const DailyRitual = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<{
    practices: Recommendation[];
    recommendedCount: number;
    reasoning: string;
  }>({ practices: [], recommendedCount: 0, reasoning: '' });
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

  const checkRitualCompletion = async () => {
    if (!user?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('ritual_date', today)
      .single();
    
    if (error || !data) {
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
      await supabase
        .from('daily_ritual_completions')
        .update({ completion_status: 'full' })
        .eq('user_id', user.id)
        .eq('ritual_date', today);
    } else if (effectiveCompletedCount > 0) {
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
    
    console.log('🎯 Daily Ritual Recommendations:', {
      practices: recs.practices.map(p => p.title),
      recommendedCount: recs.recommendedCount,
      actualCount: recs.practices.length
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

    // Ensure the ritual record exists in database
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_ritual_completions')
        .upsert({
          user_id: user.id,
          ritual_date: today,
          completion_status: ritualStatus.status === 'not_started' ? 'partial' : ritualStatus.status,
          recommended_practices_count: recommendations.recommendedCount,
          recommended_practice_ids: practices.map(r => r.id),
        }, {
          onConflict: 'user_id,ritual_date'
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
    
    const { error } = await supabase
      .from('daily_ritual_completions')
      .upsert({
        user_id: user.id,
        ritual_date: today,
        completed_practice_ids: newCompletedIds,
        recommended_practice_ids: recommendations.practices.map(p => p.id),
        recommended_practices_count: recommendations.recommendedCount,
        completion_status: newCompletedIds.length >= recommendations.recommendedCount ? 'full' : 'partial'
      });
    
    if (!error) {
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
      await supabase
        .from('daily_ritual_completions')
        .upsert({
          user_id: user.id,
          ritual_date: today,
          completion_status: 'partial',
          recommended_practices_count: recommendations.recommendedCount,
          recommended_practice_ids: practices.map(r => r.id),
          completed_practice_ids: []
        }, {
          onConflict: 'user_id,ritual_date'
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
      <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
        <div className="space-y-3">
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (recommendations.practices.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Unable to generate recommendations. Please complete your daily check-in.
        </p>
      </div>
    );
  }

  const { practices } = recommendations;

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      {ritualStatus.status === 'partial' && (
        <div className="text-xs text-muted-foreground px-4 max-w-lg mx-auto">
          {ritualStatus.completedCount} of {ritualStatus.totalCount} practices completed
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
            {practices.map((practice, index) => {
              const isCompleted = completedPracticeIds.includes(practice.id);
              
              return (
                <CarouselItem 
                  key={practice.id} 
                  className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]"
                >
                  <div
                    onClick={() => !isDragging && !isCompleted && navigateToPractice(practice)}
                    className={cn(
                      "flex bg-card rounded-lg shadow-sm overflow-hidden h-40 cursor-pointer transition-all",
                      isCompleted 
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-md",
                      index === practices.length - 1 && "mr-4"
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
                      {/* Category Label */}
                      <span className="text-sm text-primary">
                        {getProtocolType(practice)}
                      </span>
                      
                      {/* Title */}
                      <h4 className="text-lg font-bold text-foreground line-clamp-2 mt-1 leading-snug">
                        {practice.title}
                      </h4>
                      
                      {/* Duration */}
                      <span className="text-sm text-muted-foreground mt-1">
                        {practice.duration} min
                      </span>
                    </div>
                    
                    {/* Completed Check */}
                    {isCompleted && (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center mr-3 flex-shrink-0 self-center">
                        <Check size={16} className="text-primary-foreground" />
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
      <div className="px-4">
        {ritualStatus.status === 'not_started' && (
          <Button 
            onClick={handleStartRitual}
            className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
          >
            Start Your Ritual
          </Button>
        )}

        {ritualStatus.status === 'partial' && (
          <Button 
            onClick={handleContinueRitual}
            className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
          >
            Continue Your Ritual
          </Button>
        )}

        {ritualStatus.status === 'completed' && (
          <div className="flex items-center justify-between bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check size={16} className="text-green-600" />
              </div>
              <span className="text-sm font-medium text-foreground">Ritual Completed</span>
            </div>
            <Button 
              onClick={handleRestartRitual}
              variant="outline"
              size="sm"
            >
              Restart
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyRitual;
