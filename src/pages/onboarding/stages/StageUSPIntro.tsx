import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import uspSkyLight from "@/assets/onboarding/usp-sky-light.jpeg";
import uspSkyDark from "@/assets/onboarding/usp-sky-dark.jpeg";

interface Slide {
  headline: string;
  subtitle: string;
  visual: "sky-light" | "pulse" | "sky-dark";
}

const slides: Slide[] = [
  {
    headline: "Peak performers don\u2019t react. They anticipate.",
    subtitle: "Your day mapped. Your state read. Your plan ready \u2013 before you need it.",
    visual: "sky-light",
  },
  {
    headline: "You stop guessing. The intelligence does the work.",
    subtitle: "Your context connected. Your patterns learnt. Your history decoded \u2013 before your day begins.",
    visual: "pulse",
  },
  {
    headline: "Every elite athlete has a performance team. Now you do too.",
    subtitle: "A thinking partner. A preparation system. A recalibration space. A performance intelligence layer. Always on.",
    visual: "sky-dark",
  },
];

function PulseVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-b from-[hsl(var(--background))] to-[hsl(220,20%,12%)] overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-saffron/10 blur-[80px] animate-pulse" />
      </div>
      {/* Heartbeat SVG */}
      <svg
        viewBox="0 0 400 120"
        className="relative z-10 w-[85%] max-w-sm"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="pulse-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--saffron))" stopOpacity="0.3" />
            <stop offset="40%" stopColor="hsl(var(--saffron))" stopOpacity="1" />
            <stop offset="60%" stopColor="hsl(var(--gold))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0.3" />
          </linearGradient>
          <filter id="pulse-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M 0,60 L 80,60 L 120,60 L 150,20 L 170,90 L 190,30 L 210,70 L 230,55 L 260,60 L 400,60"
          fill="none"
          stroke="url(#pulse-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#pulse-glow)"
          className="animate-[dash_3s_ease-in-out_infinite]"
          strokeDasharray="600"
          strokeDashoffset="600"
          style={{
            animation: "dash 3s ease-in-out infinite",
          }}
        />
      </svg>
      <style>{`
        @keyframes dash {
          0% { stroke-dashoffset: 600; }
          50% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -600; }
        }
      `}</style>
    </div>
  );
}

export default function StageUSPIntro() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      navigate("/onboarding/context-connection", { replace: true });
    }
  }, [currentSlide, navigate]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) setCurrentSlide((s) => s - 1);
  }, [currentSlide]);

  const skip = useCallback(() => {
    navigate("/onboarding/context-connection", { replace: true });
  }, [navigate]);

  useSwipeHandler({ onSwipeLeft: goNext, onSwipeRight: goPrev, threshold: 50 });

  const slide = slides[currentSlide];

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Visual – top ~45% */}
      <div className="relative w-full flex-[0_0_45%] overflow-hidden">
        {slide.visual === "sky-light" && (
          <img
            src={uspSkyLight}
            alt="Engraved sky illustration"
            className="w-full h-full object-cover"
          />
        )}
        {slide.visual === "sky-dark" && (
          <img
            src={uspSkyDark}
            alt="Dramatic engraved sky illustration"
            className="w-full h-full object-cover"
          />
        )}
        {slide.visual === "pulse" && <PulseVisual />}
        {/* Fade to background */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Text + Controls – bottom ~55% */}
      <div className="flex-1 flex flex-col justify-between px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4">
        {/* Headlines */}
        <div className="space-y-4 text-center">
          <h1 className="font-headline text-2xl font-bold italic leading-tight tracking-tight text-foreground">
            {slide.headline}
          </h1>
          <p className="font-subheadline text-base text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {slide.subtitle}
          </p>
        </div>

        {/* Dots + Buttons */}
        <div className="space-y-4">
          {/* Dot indicators */}
          <div className="flex justify-center gap-2">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentSlide
                    ? "w-6 bg-saffron"
                    : "w-2 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <Button
              variant="critical"
              size="lg"
              className="w-full rounded-2xl"
              onClick={goNext}
            >
              {currentSlide < slides.length - 1 ? "Continue" : "Let\u2019s Go"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-2xl"
              onClick={skip}
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
