import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import uspSunriseEngraved from "@/assets/onboarding/usp-sunrise-engraved.jpg";
import slide1Engraved from "@/assets/onboarding/app-intro-slide-1-engraved.jpg";
import slide2Engraved from "@/assets/onboarding/app-intro-slide-2-engraved.jpg";
import slide3Engraved from "@/assets/onboarding/app-intro-slide-3-engraved.jpg";

/**
 * USP Carousel — new onboarding v8 intro.
 * Dark 4-slide carousel. Final CTA → Leadership Context.
 * Reuses an existing onboarding asset as the hero image (no new imagery).
 */

const SLIDES = [
  {
    title: "Stay Mentally Ahead",
    body:
      "MindModule acts as a proactive Chief of Staff for your mind — reading your cognitive state, anticipating what the day demands, and deploying the right protocols before performance slips.",
    image: slide1Engraved,
  },
  {
    title: "Prepare for what the day demands.",
    body:
      "Today combines your calendar, cognitive load, recovery signals, and work patterns to help you stay sharp through critical moments.",
    image: slide2Engraved,
  },
  {
    title: "Protect your cognitive edge for key moments.",
    body:
      "Your plan gives you interventions to protect composure, clarity and capacity — and prevent mental noise, stress accumulation, emotional hijack and recovery debt. All, before cognitive performance declines.",
    image: slide3Engraved,
  },
  {
    title: "Learn how you perform at your best.",
    body:
      "Performance Patterns identifies the signals behind your cognitive performance — from recovery and workload to focus, stress, and decision quality.",
    image: uspSunriseEngraved,
  },
];

const NEXT_ROUTE = "/onboarding/leadership-context";

export default function StageUSPIntro() {
  const navigate = useNavigate();
  const location = useLocation();
  const startAtLast =
    !!(location.state && typeof location.state === "object" && (location.state as { startAtLast?: boolean }).startAtLast);
  const [idx, setIdx] = useState(startAtLast ? SLIDES.length - 1 : 0);
  const isFinal = idx === SLIDES.length - 1;

  const next = useCallback(() => {
    if (isFinal) navigate(NEXT_ROUTE);
    else setIdx((i) => i + 1);
  }, [isFinal, navigate]);

  // Carousel-aware back: when not on the first slide, absorb the top-nav back
  // press and step the carousel backwards instead of leaving the route.
  useEffect(() => {
    const onBack = (e: Event) => {
      if (idx > 0) {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("onboarding:back", onBack as EventListener);
    return () => window.removeEventListener("onboarding:back", onBack as EventListener);
  }, [idx]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app-surface text-[#1a1712] overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      {/* Spacer for fixed top nav */}
      <div className="shrink-0 h-[calc(53px+env(safe-area-inset-top,0px))]" />

      {/* Hero image (reuses existing engraved asset) */}
      <div
        className="relative shrink-0 h-[44vh] overflow-hidden"
        style={{ backgroundColor: "#ece4d6" }}
      >
        <img
          src={SLIDES[idx].image}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full"
          style={{
            filter: "grayscale(1) contrast(1.05)",
          objectFit: idx < 3 ? "cover" : "cover",
          objectPosition: idx < 3 ? "center bottom" : "center",
          }}
        />
      </div>

      {/* Title + body */}
      <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
        <h1 className="font-headline text-[28px] leading-[1.22] text-[#1a1712]">
          {SLIDES[idx].title}
        </h1>
        <div className="w-7 h-px bg-[#1a1712]/15 my-4" />
        <p className="text-[13px] leading-[1.7] text-[#7a7060] max-w-[300px]">
          {SLIDES[idx].body}
        </p>
      </div>

      {/* Pagination dots */}
      <div className="flex justify-center gap-1.5 pb-3">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              i === idx ? "w-[22px] bg-saffron" : "w-[7px] bg-[#cfc7b8]"
            }`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 pb-7 shrink-0">
        <button
          onClick={next}
          className="w-full py-4 rounded-2xl bg-saffron hover:bg-saffron/90 transition-colors text-white text-sm font-medium"
        >
          {isFinal ? "Get started →" : "Continue"}
        </button>
        <button
          onClick={() => navigate(NEXT_ROUTE)}
          className="block w-full text-center text-xs text-[#7a7060] mt-3 py-2"
        >
          Skip tour
        </button>
      </div>
    </div>
  );
}
