/**
 * JitCarousel - Renders pre-event JIT interventions as a horizontal carousel.
 * Matches the time-of-day carousel card design from DailyRitual.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Heart, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import MetricInfoModal from '@/components/home/MetricInfoModal';
import { getAuthToken } from '@/services/authTokenService';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

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

  const handleStartPrep = () => {
    const modules = preEventPlan.modules;
    if (modules.length > 0) {
      if (preEventPlan.coachCard?.prompt) {
        localStorage.setItem('jitInterventionData', JSON.stringify({
          coachPrompt: preEventPlan.coachCard.prompt,
          flowType: 'prepare',
          eventTitle: preEventPlan.eventTitle,
        }));
      }
      const first = modules[0];
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
      let route = first.contentType === 'soundbath'
        ? `/soundscapes/${first.contentId}`
        : first.contentType === 'guided-practice'
          ? `/guided-practices/${first.contentId}`
          : `/micro-practice/${first.contentId}/cards`;
      navigate(route, { state: { category: 'pause', fromIntervention: true } });
    } else if (preEventPlan.coachCard?.prompt) {
      navigate('/coach', { state: { flowType: 'prepare', initialPrompt: preEventPlan.coachCard.prompt, fromIntervention: true, eventTitle: preEventPlan.eventTitle } });
    }
  };

  const navigateToModule = (module: PreEventModule) => {
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
    let route = module.contentType === 'soundbath'
      ? `/soundscapes/${module.contentId}`
      : module.contentType === 'guided-practice'
        ? `/guided-practices/${module.contentId}`
        : `/micro-practice/${module.contentId}/cards`;
    navigate(route, { state: { category: 'pause', fromIntervention: true } });
  };

  const getModuleDisplay = (module: PreEventModule) => {
    const labels: Record<string, string> = { regulate: 'Regulate', align: 'Align', prepare: 'Prepare', integrate: 'Integrate' };
    const protocolTypes: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Inner Mastery Coach', integrate: 'Inner Mastery Coach' };
    return { label: labels[module.type] || 'Prepare', protocolType: protocolTypes[module.type] || 'Protocol' };
  };

  const eventTypeLabel = preEventPlan.eventType
    ? preEventPlan.eventType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Upcoming Event';

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="px-4 md:px-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/70 font-body">
            Just-in-Time
          </span>
          <div className="flex items-center gap-2">
            <MetricInfoModal
              title="Just-in-Time Preparation"
              description="A focused preparation sequence for the high-stakes moment ahead. Two or three minutes of targeted practice — regulation, alignment, and a coaching prompt — designed to bring your best self into the room."
            />
            <button
              onClick={handleDismiss}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Event header with pills inline — same structure as time-of-day */}
      <div className="px-4 md:px-6 max-w-lg mx-auto space-y-2">
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

        {/* Context description — AI-generated "why this event" reasoning */}
        <p className="text-xs text-muted-foreground italic font-body leading-relaxed">
          {preEventPlan.contextDescription}
        </p>
      </div>

      {/* Carousel of module cards */}
      {preEventPlan.modules.length > 0 && (
        <>
          <div className="relative w-full">
            <Carousel opts={{ align: 'start', loop: false, watchDrag: true }} className="w-full" setApi={setCarouselApi}>
              <CarouselContent className="-ml-3 pl-4 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'pan-y' }}>
                {preEventPlan.modules.map((module, index) => {
                  const isCoach = module.isCoachCard;
                  const display = getModuleDisplay(module);
                  const isLastCard = index === preEventPlan.modules.length - 1;

                  return (
                    <CarouselItem key={module.contentId || index} className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]">
                      <div
                        onClick={() => !isDragging && navigateToModule(module)}
                        className={cn(
                          "flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                          "bg-white/15 backdrop-blur-md border border-white/40",
                          "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                          "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                          isLastCard && "mr-4"
                        )}
                      >
                        {/* Thumbnail */}
                        {isCoach ? (
                          <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                            <img src={coachVisual} alt="" className="w-full h-full object-cover object-top brightness-75" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                              <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                            </div>
                            <div className="absolute top-2 right-2 bg-saffron/90 text-charcoal text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow-sm">
                              Prepare
                            </div>
                          </div>
                        ) : (
                          <img
                            src={module.thumbnailUrl || getContentById(module.contentId)?.thumbnail || ''}
                            alt={module.title}
                            className="w-32 h-full object-cover flex-shrink-0"
                          />
                        )}

                        {/* Content */}
                        <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium tracking-wide uppercase text-saffron font-body">{display.label}</span>
                            <span className="text-[10px] text-muted-foreground/60 font-body">{display.protocolType}</span>
                          </div>
                          <div className="flex items-start gap-1 mt-1.5">
                            <h4 className="text-base font-semibold text-foreground line-clamp-2 leading-snug font-body flex-1">{module.title}</h4>
                            {!isCoach && isFavorite(module.contentId) && (
                              <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-muted-foreground font-body">{module.duration} min</span>
                          </div>
                        </div>
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
          className="w-full h-10 text-sm font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl"
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
