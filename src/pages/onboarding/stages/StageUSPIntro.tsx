import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import uspSunriseEngraved from "@/assets/onboarding/usp-sunrise-engraved.jpg";
import uspPulseSignal from "@/assets/onboarding/usp-pulse-signal.jpg";
import uspConstellation from "@/assets/onboarding/usp-constellation.jpg";
import mmLogo from "@/assets/brand/mm-logo-circle.png";
import heroBg from "@/assets/onboarding/onboarding-intro-active.jpg";

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

const TOTAL_DOTS = 5;

export default function StageUSPIntro() {
  const navigate = useNavigate();
  const location = useLocation();
  const resumeSlide = (location.state as { resumeSlide?: number } | null)?.resumeSlide;
  const [currentSlide, setCurrentSlide] = useState(resumeSlide ?? -1);

  const isIntro = currentSlide === -1;
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

  /* ── Dot indicators ── */
  const dots = (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === activeDot
              ? "w-6 bg-saffron"
              : "w-2 bg-white/30"
          }`}
        />
      ))}
    </div>
  );

  /* ── Back button top bar ── */
  const topBar = (
    <div className={`fixed top-0 left-0 right-0 z-50 safe-area-top ${isIntro ? 'bg-black/30 backdrop-blur-md border-b border-white/[0.08]' : 'bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}>
      <div className="flex items-center justify-between px-4 py-2">
        <Button variant="glass" size="sm" onClick={goPrev} className={isIntro ? "text-white" : "text-foreground"}>
          <ArrowLeft size={20} />
        </Button>
        <div />
      </div>
    </div>
  );

  /* ── Intro screen ── */
  if (isIntro) {
    return (
      <div className="fixed inset-0 flex flex-col items-center overflow-hidden">
        {topBar}

        {/* Full-bleed background matching Stage1Welcome / Front */}
        <img
          src={heroBg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          width={1080}
          height={1920}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center h-full w-full px-6">
          <div className="flex flex-col items-center space-y-4 mt-[38%] sm:mt-auto sm:flex-1 sm:justify-center">
            <img src={mmLogo} alt="Mind Module logo" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg" />

            <h1 className="text-5xl sm:text-7xl font-headline font-bold text-white tracking-wider leading-none uppercase">
              MIND MODULE
            </h1>
            <p className="text-[9px] sm:text-xs tracking-[0.35em] uppercase text-white/50 font-body -mt-1 sm:-mt-3">
              Executive Edition
            </p>

            <div className="bg-white/15 backdrop-blur-md border border-white/40 rounded-3xl p-6 mt-8 max-w-sm mx-auto">
              <h2 className="font-headline text-[2rem] sm:text-4xl font-bold leading-tight tracking-tight text-white">
                A new era of executive performance.
              </h2>
              <p className="font-body text-[1.0625rem] sm:text-lg text-white/70 leading-relaxed mt-3">
                This isn't self-improvement. This is self-mastery.
              </p>
            </div>
          </div>

          {/* Bottom: dots + CTA */}
          <div className="w-full mt-auto mb-[22%] sm:mb-auto sm:mt-8">
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
      </div>
    );
  }

  /* ── USP slides ── */
  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {topBar}

      {/* Contained image window */}
      <div className="pt-14 px-4">
        <div className="relative rounded-2xl overflow-hidden" style={{ height: '42vh' }}>
          <img
            src={slide.image}
            alt={slide.alt}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Bottom fade into background */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
        </div>
      </div>

      {/* Text below image */}
      <div className="flex-1 flex flex-col px-6 pt-5">
        <div className="space-y-3 text-center">
          <h1 className="font-headline text-[1.75rem] sm:text-3xl font-bold italic leading-tight tracking-tight text-foreground">
            {slide.headline}
          </h1>
          <p className="font-body text-[1rem] sm:text-lg text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {slide.subtitle}
          </p>
        </div>
      </div>

      {/* Bottom: dots + CTAs pinned */}
      <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {dots}

        <div className="space-y-3">
          <button
            onClick={skip}
            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2"
          >
            Skip
          </button>
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
