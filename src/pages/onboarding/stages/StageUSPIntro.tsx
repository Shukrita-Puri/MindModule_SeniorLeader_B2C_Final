import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import uspSunriseEngraved from "@/assets/onboarding/usp-sunrise-engraved.jpg";

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
  },
  {
    title: "Prepare for what the day demands.",
    body:
      "Today combines your calendar, cognitive load, recovery signals, and work patterns to help you stay sharp through critical moments.",
  },
  {
    title: "Protect your cognitive edge for key moments.",
    body:
      "Your plan gives you interventions to protect composure, clarity and capacity — and prevent mental noise, stress accumulation, emotional hijack and recovery debt. All, before cognitive performance declines.",
  },
  {
    title: "Learn how you perform at your best.",
    body:
      "Performance Patterns identifies the signals behind your cognitive performance — from recovery and workload to focus, stress, and decision quality.",
  },
];

const NEXT_ROUTE = "/onboarding/leadership-context";

export default function StageUSPIntro() {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const isFinal = idx === SLIDES.length - 1;

  const next = useCallback(() => {
    if (isFinal) navigate(NEXT_ROUTE);
    else setIdx((i) => i + 1);
  }, [isFinal, navigate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1712] text-[#f5f0e8] overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* Logo row */}
      <div className="flex items-center justify-between px-6 pt-4 shrink-0">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] border border-white/[0.12] py-1.5 pl-1.5 pr-3.5">
          <span className="w-6 h-6 rounded-full bg-[#2bc075]" />
          <span className="text-[10px] tracking-[2px] uppercase text-white/60">Mind Module</span>
        </div>
        <span className="text-[9px] tracking-[2px] uppercase text-white/25">Executive</span>
      </div>

      {/* Hero image (reuses existing asset) */}
      <div className="relative shrink-0 h-[34vh] mt-3 overflow-hidden">
        <img src={uspSunriseEngraved} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#1a1712]" />
      </div>

      {/* Title + body */}
      <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
        <h1 className="font-headline text-[28px] leading-[1.22] text-[#f5f0e8]">
          {SLIDES[idx].title}
        </h1>
        <div className="w-7 h-px bg-white/10 my-4" />
        <p className="text-[13px] leading-[1.7] text-white/55 max-w-[300px]">
          {SLIDES[idx].body}
        </p>
      </div>

      {/* Pagination dots */}
      <div className="flex justify-center gap-1.5 pb-3">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              i === idx ? "w-[22px] bg-[#e8714a]" : "w-[7px] bg-white/[0.18]"
            }`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 pb-7 shrink-0">
        <button
          onClick={next}
          className="w-full py-4 rounded-2xl bg-[#e8714a] hover:bg-[#c55a35] transition-colors text-white text-sm font-medium"
        >
          {isFinal ? "Get started →" : "Continue"}
        </button>
        <button
          onClick={() => navigate(NEXT_ROUTE)}
          className="block w-full text-center text-xs text-white/30 mt-3 py-2"
        >
          Skip tour
        </button>
      </div>
    </div>
  );
}
