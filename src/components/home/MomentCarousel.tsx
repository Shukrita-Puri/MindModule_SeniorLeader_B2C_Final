/**
 * MomentCarousel - Carousel-style display for a single moment with its pack steps
 * Matches the DailyRitual design pattern with horizontal swipeable cards
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Clock, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MomentCandidate } from '@/utils/momentDetectionEngine';
import type { BuiltPack, PackStep } from '@/utils/packBuilderSystem';

interface MomentCarouselProps {
  moment: MomentCandidate;
  pack: BuiltPack;
  onStartPack: () => void;
  onStartStep: (step: PackStep) => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}

const getStepLabel = (step: PackStep): string => {
  if (step.content.contentType === 'soundbath') {
    return 'Somatic Protocol';
  }
  if (step.content.contentType === 'guided-practice') {
    return step.content.tags?.some(t => 
      t.toLowerCase().includes('somatic') || 
      t.toLowerCase().includes('breathing')
    ) ? 'Somatic Protocol' : 'Mindset Protocol';
  }
  // Micro-practices
  return step.content.subType === 'mindset' ? 'Mindset Protocol' : 'Somatic Protocol';
};

const MomentCarousel = ({
  moment,
  pack,
  onStartPack,
  onStartStep,
  onSnooze,
  onDismiss
}: MomentCarouselProps) => {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  useEffect(() => {
    if (!carouselApi) return;
    setSlideCount(carouselApi.scrollSnapList().length);
    setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on("select", () => setCurrentSlide(carouselApi.selectedScrollSnap()));
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

  const snoozeOptions = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '1 hour', value: 60 }
  ];

  return (
    <div className="space-y-4">
      {/* Moment Header */}
      <div className="px-4 flex items-start justify-between">
        <div className="space-y-1">
          <Badge variant="secondary" className="text-xs">
            {moment.label}
          </Badge>
          <h3 className="text-base font-semibold text-foreground line-clamp-1">
            {moment.event_context.event_title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {pack.template_name} · {pack.total_duration} min
          </p>
        </div>
        
        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </div>

      {/* Pack Steps Carousel */}
      <div className="relative w-full">
        <Carousel 
          opts={{ align: 'start', loop: false, watchDrag: true }} 
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent className="-ml-3 pl-4 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'pan-y' }}>
            {pack.steps.map((step, index) => (
              <CarouselItem 
                key={step.content.id} 
                className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]"
              >
                <div
                  onClick={() => !isDragging && onStartStep(step)}
                  className={cn(
                    "flex bg-card rounded-lg shadow-sm overflow-hidden h-40 cursor-pointer transition-all hover:shadow-md",
                    index === pack.steps.length - 1 && "mr-4"
                  )}
                >
                  {/* Thumbnail */}
                  <img 
                    src={step.content.thumbnail} 
                    alt={step.content.title}
                    className="w-32 h-full object-cover flex-shrink-0"
                  />
                  
                  {/* Content */}
                  <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                    {/* Step Label */}
                    <span className="text-sm text-primary">
                      {getStepLabel(step)}
                    </span>
                    
                    {/* Title */}
                    <h4 className="text-lg font-bold text-foreground line-clamp-2 mt-1 leading-snug">
                      {step.content.title}
                    </h4>
                    
                    {/* Duration */}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Clock size={12} />
                      <span>{step.duration} min</span>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        
        {/* Swipe hint gradient */}
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

      {/* Actions */}
      <div className="px-4 space-y-3">
        <Button 
          onClick={onStartPack}
          className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
        >
          Start Pack
        </Button>
        
        {/* Snooze */}
        <div className="relative">
          <button
            onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto"
          >
            Snooze
            <ChevronDown size={14} className={cn("transition-transform", showSnoozeOptions && "rotate-180")} />
          </button>
          
          {showSnoozeOptions && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex gap-2 bg-card border border-border rounded-lg p-2 shadow-md z-10">
              {snoozeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSnooze(option.value);
                    setShowSnoozeOptions(false);
                  }}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MomentCarousel;
