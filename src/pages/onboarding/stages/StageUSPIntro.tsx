import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import uspSunriseEngraved from "@/assets/onboarding/usp-sunrise-engraved.jpg";
import uspPulseSignal from "@/assets/onboarding/usp-pulse-signal.jpg";
import uspConstellation from "@/assets/onboarding/usp-constellation.jpg";
import mmLogo from "@/assets/brand/mm-logo-circle.png";

interface Slide {
  headline: string;
  subtitle: string;
  image: string;
  alt: string;
}

const slides: Slide[] = [
  {
    headline: "Peak performers don\u2019t react. They anticipate.",
    subtitle: "Your day mapped. Your state read. Your plan ready \u2013 before you need it.",
    image: uspSunriseEngraved,
    alt: "Engraved sky illustration",
  },
  {
    headline: "Every elite athlete has a performance team. Now you do too.",
    subtitle: "A thinking partner. A preparation system. A recalibration space. A performance intelligence layer. Always on.",
    image: uspConstellation,
    alt: "Constellation of intelligence",
  },
  {
    headline: "You stop guessing. The intelligence does the work.",
    subtitle: "Your context connected. Your patterns learnt. Your history decoded \u2013 before your day begins.",
    image: uspPulseSignal,
    alt: "Pulse and data signal",
  },
];

// Total dots: intro + 3 USP slides + context-connection = 5
const TOTAL_DOTS = 5;

export default function StageUSPIntro() {
  const navigate = useNavigate();
  // -1 = intro screen, 0-2 = USP slides
  const [currentSlide, setCurrentSlide] = useState(-1);

  const isIntro = currentSlide === -1;
  // dot index: intro=0, slide0=1, slide1=2, slide2=3
  const activeDot = isIntro ? 0 : currentSlide + 1;

  const goNext = useCallback(() => {
    if (isIntro) {
      setCurrentSlide(0);
    } else if (currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      navigate("/onboarding/context-connection", { replace: true });
    }
  }, [currentSlide, isIntro, navigate]);

  const goPrev = useCallback(() => {
    if (currentSlide === -1) {
      navigate("/onboarding/payment");
    } else {
      setCurrentSlide((s) => s - 1);
    }
  }, [currentSlide, navigate]);

  const skip = useCallback(() => {
    navigate("/onboarding/context-connection", { replace: true });
  }, [navigate]);

  useSwipeHandler({ onSwipeLeft: goNext, onSwipeRight: goPrev, threshold: 50 });

  /* ── Back button top bar ── */
  const topBar = (
    <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between px-4 py-2">
        <Button variant="glass" size="sm" onClick={goPrev}>
          <ArrowLeft size={20} />
        </Button>
        <div />
      </div>
    </div>
  );

  /* ── Dot indicators ── */
  const dots = (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === activeDot
              ? "w-6 bg-saffron"
              : isIntro
                ? "w-2 bg-muted-foreground/30"
                : "w-2 bg-white/30"
          }`}
        />
      ))}
    </div>
  );

  /* ── Intro screen ── */
  if (isIntro) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col">
        {topBar}

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 rounded-full overflow-hidden mb-4 shadow-lg">
            <img
              src={mmLogo}
              alt="Mind Module logo"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground font-headline mb-10">
            Mind Module
          </p>

          <h1 className="font-headline text-[2rem] sm:text-4xl font-bold leading-tight tracking-tight text-foreground mb-4">
            A new era of executive performance.
          </h1>
          <p className="font-body text-[1.0625rem] sm:text-lg text-muted-foreground leading-relaxed max-w-sm mx-auto">
            This isn't self-improvement. This is self-mastery.
          </p>
        </div>

        {/* Bottom: dots + CTA */}
        <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          {dots}
          <Button
            variant="critical"
            size="lg"
            className="w-full rounded-2xl"
            onClick={goNext}
          >
            See how it works →
          </Button>
        </div>
      </div>
    );
  }

  /* ── USP slides ── */
  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 bg-background">
      {topBar}

      {/* Full-screen background image */}
      <img
        src={slide.image}
        alt={slide.alt}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Content pinned to bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {/* Text */}
        <div className="space-y-3 text-center mb-8">
          <h1 className="font-headline text-[2rem] sm:text-4xl font-bold italic leading-tight tracking-tight text-white">
            {slide.headline}
          </h1>
          <p className="font-body text-[1.0625rem] sm:text-lg text-white/70 leading-relaxed max-w-sm mx-auto">
            {slide.subtitle}
          </p>
        </div>

        {/* Dot indicators */}
        {dots}

        {/* Buttons */}
        <div className="space-y-3">
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-2xl border-white/20 text-white hover:bg-white/10 hover:text-white bg-white/5 backdrop-blur-sm"
            onClick={skip}
          >
            Skip
          </Button>
          <Button
            variant="critical"
            size="lg"
            className="w-full rounded-2xl"
            onClick={goNext}
          >
            {isLastSlide ? "Connect your Intelligence" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
