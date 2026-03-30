/**
 * JitCarousel - Renders pre-event JIT interventions as a horizontal carousel.
 * Matches the time-of-day carousel card design from DailyRitual.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Heart, ChevronDown, Check, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import MetricInfoModal from '@/components/home/MetricInfoModal';
import { getAuthToken } from '@/services/authTokenService';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getTodayRitual } from '@/utils/dailyRituals';
import { getCurrentTimeWindow } from '@/utils/dailyCheckins';

import coachVisual from '@/assets/shared/coach-visual-calm.jpeg';

interface PreEventModule {
  type: string;
  contentId: string;
  title: string;
  contentType: string;
  duration: number;
  focus: string;
  intensity: string;
  isFavorite: boolean;
  isCoachCard?: boolean;
  reasoning: string;
  thumbnailUrl?: string;
}

interface PreEventPlan {
  eventTitle: string;
  eventType: string;
  minutesUntil: number;
  timePill: string;
  contextDescription: string;
  modules: PreEventModule[];
  coachCard: any;
  progressTracked: boolean;
  hrvCorrelation?: {
    eventType: string;
    avgDeviation: number;
    historicalCount: number;
  } | null;
  horizon?: string;
  eventId?: string;
}

interface JitCarouselProps {
  preEventPlan?: PreEventPlan | null;
}


const JitCarousel = ({ preEventPlan }: JitCarouselProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFavorite } = useFavorites();

  const [dismissed, setDismissed] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [completedModuleIds, setCompletedModuleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!carouselApi) return;
    setSlideCount(carouselApi.scrollSnapList().length);
    setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on('select', () => setCurrentSlide(carouselApi.selectedScrollSnap()));
  }, [carouselApi]);

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
    const refreshJitCompletion = async () => {
      if (!user || !preEventPlan?.modules?.length) {
        setCompletedModuleIds([]);
        return;
      }

      try {
        const ritual = await getTodayRitual(getCurrentTimeWindow());
        const completedIds = ritual?.completed_practice_ids || [];
        const jitModuleIds = preEventPlan.modules.map((module) => module.contentId);
        setCompletedModuleIds(jitModuleIds.filter((id) => completedIds.includes(id)));
      } catch (error) {
        console.error('[JitCarousel] Failed to load completion state:', error);
      }
    };

    refreshJitCompletion();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshJitCompletion();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, preEventPlan]);

  if (!preEventPlan || dismissed || snoozed) return null;

  const trackJitAction = async (action: 'dismissed' | 'snoozed') => {
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
      await supabase.functions.invoke('track-jit-skip', {
        headers,
        body: {
          action,
          eventType: preEventPlan.eventType,
          eventTitle: preEventPlan.eventTitle,
          eventId: preEventPlan.eventId || null,
          horizon: preEventPlan.horizon || null,
        }
      });
    } catch { /* silent */ }
  };

  const handleDismiss = async () => {
    setDismissed(true);
    await trackJitAction('dismissed');
  };

  const handleSnooze = async () => {
    setSnoozed(true);
    await trackJitAction('snoozed');
  };

  const setJitPracticeQueue = (selectedContentId?: string) => {
    const queue = preEventPlan.modules.map((module) => ({
      id: module.contentId,
      title: module.title,
      contentType: module.isCoachCard ? 'coach' : module.contentType,
      category: module.isCoachCard ? 'coach' : 'pause',
      duration: module.duration,
    }));

    if (queue.length === 0) return;

    localStorage.setItem('practiceQueue', JSON.stringify(queue));
    const selectedIndex = selectedContentId
      ? queue.findIndex((item) => item.id === selectedContentId)
      : 0;
    localStorage.setItem('queueIndex', String(selectedIndex >= 0 ? selectedIndex : 0));
    localStorage.setItem('ritualMode', 'true');

    const hasCoachStep = queue.some((item) => item.contentType === 'coach');
    if (hasCoachStep && preEventPlan.coachCard?.prompt) {
      localStorage.setItem('jitInterventionData', JSON.stringify({
        coachPrompt: preEventPlan.coachCard.prompt,
        flowType: 'prepare',
        eventTitle: preEventPlan.eventTitle,
        hasCoachStep: true,
      }));
    } else {
      localStorage.removeItem('jitInterventionData');
    }
  };

  const handleStartPrep = () => {
    const modules = preEventPlan.modules;
    if (modules.length > 0) {

      const first = modules[0];
      setJitPracticeQueue(first.contentId);

      if (first.isCoachCard) {
        navigate('/coach', {
          state: {
            flowType: 'prepare',
            initialPrompt: preEventPlan.coachCard?.prompt || "Let's prepare for what's ahead.",
            fromIntervention: true,
            eventTitle: preEventPlan.eventTitle
          }
        });
        return;
      }

      const route = first.contentType === 'soundbath'
        ? `/soundscapes/${first.contentId}`
        : first.contentType === 'guided-practice'
          ? `/guided-practices/${first.contentId}`
          : `/micro-practice/${first.contentId}/cards`;
      navigate(route, { state: { category: 'pause', fromIntervention: true } });
    } else if (preEventPlan.coachCard?.prompt) {
      navigate('/coach', {
        state: {
          flowType: 'prepare',
          initialPrompt: preEventPlan.coachCard.prompt,
          fromIntervention: true,
          eventTitle: preEventPlan.eventTitle,
        }
      });
    }
  };

  const navigateToModule = (module: PreEventModule) => {
    setJitPracticeQueue(module.contentId);

    if (module.isCoachCard) {
      navigate('/coach', {
        state: {
          flowType: 'prepare',
          initialPrompt: preEventPlan.coachCard?.prompt || "Let's prepare for what's ahead.",
          fromIntervention: true,
          eventTitle: preEventPlan.eventTitle
        }
      });
      return;
    }

    const route = module.contentType === 'soundbath'
      ? `/soundscapes/${module.contentId}`
      : module.contentType === 'guided-practice'
        ? `/guided-practices/${module.contentId}`
        : `/micro-practice/${module.contentId}/cards`;
    navigate(route, { state: { category: 'pause', fromIntervention: true } });
  };

  const getModuleDisplay = (module: PreEventModule) => {
    const labels: Record<string, string> = { regulate: 'Regulate', align: 'Align', prepare: 'Prepare', integrate: 'Integrate' };
    const protocolTypes: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
    return { label: labels[module.type] || 'Prepare', protocolType: protocolTypes[module.type] || 'Protocol' };
  };

  const eventTypeLabel = preEventPlan.eventType
    ? preEventPlan.eventType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Upcoming Event';

  return (
    <div className="space-y-3">
      {/* Section header — tooltip aligned with Time of Day section */}
      <div className="px-4 md:px-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/70 font-body">
            Just-in-Time
          </span>
          <MetricInfoModal
            title="Just-in-Time Preparation"
            description="A focused preparation sequence for the high-stakes moment ahead. Two or three minutes of targeted practice — regulation, alignment, and a coaching prompt — designed to bring your best self into the room."
          />
        </div>
      </div>

      {/* Event header with pills inline + X dismiss — same structure as time-of-day */}
      <div className="px-4 md:px-6 max-w-lg mx-auto space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground font-body">
                {preEventPlan.eventTitle || 'Upcoming Event'}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-background border border-border text-foreground">
                {preEventPlan.timePill}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {eventTypeLabel}
              </span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-start justify-between gap-3">
          {/* Context description — AI-generated "why this event" reasoning — hidden if low confidence */}
          {preEventPlan.contextDescription && preEventPlan.contextDescription.length > 0 && (
            <p className="text-xs text-muted-foreground italic font-body leading-relaxed flex-1 min-w-0">
              {preEventPlan.contextDescription}
            </p>
          )}

          {/* Progress tracker — mirrors Time-of-Day placement */}
          <span className={cn(
            "text-xs font-medium font-body whitespace-nowrap",
            completedModuleIds.length >= preEventPlan.modules.length ? "text-emerald-500" : completedModuleIds.length > 0 ? "text-emerald-500/80" : "text-foreground/80"
          )}>
            {completedModuleIds.length > 0 && <Check size={12} className="inline mr-0.5 -mt-0.5" />}
            {completedModuleIds.length} of {preEventPlan.modules.length} completed
          </span>
        </div>

        {/* HRV Correlation Badge */}
        {preEventPlan.hrvCorrelation && Math.abs(preEventPlan.hrvCorrelation.avgDeviation) > 10 && (
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs mt-1.5",
            preEventPlan.hrvCorrelation.avgDeviation > 0
              ? "bg-saffron/10 text-saffron border-l-2 border-saffron/60"
              : "bg-primary/10 text-primary border-l-2 border-primary/60"
          )}>
            <Activity size={14} className="flex-shrink-0" />
            <span className="font-medium">
              HRV {preEventPlan.hrvCorrelation.avgDeviation > 0 ? '+' : ''}{preEventPlan.hrvCorrelation.avgDeviation}%
            </span>
            <span className="text-[10px] opacity-70 italic">
              (based on {preEventPlan.hrvCorrelation.historicalCount} past {preEventPlan.hrvCorrelation.eventType} meetings)
            </span>
          </div>
        )}
      </div>

      {/* Carousel of module cards */}
      {preEventPlan.modules.length > 0 && (
        <>
          <div className="relative w-full">
            <Carousel opts={{ align: 'start', loop: false, watchDrag: true }} className="w-full" setApi={setCarouselApi}>
              <CarouselContent className="-ml-3 pl-4 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'pan-y' }}>
                {preEventPlan.modules.map((module, index) => {
                  const isCoach = module.isCoachCard;
                  const isCompleted = completedModuleIds.includes(module.contentId);
                  const display = getModuleDisplay(module);
                  const isLastCard = index === preEventPlan.modules.length - 1;

                  return (
                    <CarouselItem key={module.contentId || index} className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]">
                      <div
                        onClick={() => !isDragging && !isCompleted && navigateToModule(module)}
                        className={cn(
                          "relative flex rounded-xl overflow-hidden h-44 transition-all duration-300",
                          "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                          isCompleted
                            ? "bg-emerald-950/20 backdrop-blur-md border border-emerald-500/30 opacity-65 cursor-default"
                            : "bg-white/15 backdrop-blur-md border border-white/40 cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                          isLastCard && "mr-4"
                        )}
                      >
                        {/* Completed overlay badge */}
                        {isCompleted && (
                          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-emerald-600/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                            <Check size={10} className="stroke-[3]" />
                            Done
                          </div>
                        )}

                        {/* Thumbnail */}
                        {isCoach ? (
                          <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                            <img src={coachVisual} alt="" className={cn("w-full h-full object-cover object-top", isCompleted ? "brightness-50 grayscale-[30%]" : "brightness-75")} />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                              <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                            </div>
                            {!isCompleted && (
                              <div className="absolute top-2 right-2 bg-saffron/90 text-charcoal text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow-sm">
                                Prepare
                              </div>
                            )}
                          </div>
                        ) : (
                          <img
                            src={module.thumbnailUrl || getContentById(module.contentId)?.thumbnail || ''}
                            alt={module.title}
                            className={cn("w-32 h-full object-cover flex-shrink-0", isCompleted && "brightness-50 grayscale-[30%]")}
                          />
                        )}

                        {/* Content */}
                        <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                          <div className="flex flex-col gap-0.5">
                            <span className={cn("text-xs font-medium tracking-wide uppercase font-body", isCompleted ? "text-emerald-500/80" : "text-saffron")}>{display.label}</span>
                            <span className="text-[10px] text-muted-foreground/60 font-body">{display.protocolType}</span>
                          </div>
                          <div className="flex items-start gap-1 mt-1.5">
                            <h4 className={cn("text-base font-semibold line-clamp-2 leading-snug font-body flex-1", isCompleted ? "text-foreground/50 line-through decoration-1" : "text-foreground")}>{module.title}</h4>
                            {!isCoach && isFavorite(module.contentId) && (
                              <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                          {module.reasoning && !isCompleted && (
                            <p className="text-[11px] text-muted-foreground italic font-body line-clamp-2 leading-snug mt-0.5">
                              {module.reasoning}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            {isCompleted ? (
                              <span className="text-[10px] text-emerald-500/70 font-medium font-body">Completed</span>
                            ) : (
                              <span className="text-xs text-muted-foreground font-body">{module.duration} min</span>
                            )}
                          </div>
                        </div>

                        {isCompleted && (
                          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center mr-3 flex-shrink-0 self-center">
                            <Check size={16} className="text-white stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            </Carousel>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
          </div>

          {/* Pagination dots */}
          {slideCount > 1 && (
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: slideCount }).map((_, index) => (
                <button key={index} onClick={() => carouselApi?.scrollTo(index)} className={cn("h-2 rounded-full transition-all", index === currentSlide ? "bg-primary w-4" : "bg-muted-foreground/30 w-2")} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Start Pack + Snooze */}
      <div className="px-4 md:px-6 max-w-lg mx-auto space-y-1">
        <Button
          onClick={handleStartPrep}
          className="w-full h-12 text-base font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
        >
          Start Your Just in Time Plan
        </Button>
        <button
          onClick={handleSnooze}
          className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Snooze <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
};

export default JitCarousel;
