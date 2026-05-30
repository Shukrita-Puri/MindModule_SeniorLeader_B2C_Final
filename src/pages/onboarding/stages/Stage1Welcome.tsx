import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import mmLogo from "@/assets/brand/mm-logo-circle.png";
import heroBg from "@/assets/onboarding/onboarding-welcome-active.jpg";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex flex-col items-center overflow-hidden animate-fade-in pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* Full-bleed background */}
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
      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full w-full px-5 py-4 max-w-4xl mx-auto">
        {/* Top section — logo + brand (matches Front page lockup) */}
        <div className="relative flex flex-col items-center space-y-2 sm:space-y-3">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[340px] blur-2xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0) 75%)",
            }}
          />
          <img src={mmLogo} alt="Mind Module logo" className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg" />
          <h1
            className="relative text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-headline font-bold text-white tracking-wider leading-none"
            style={{ textShadow: "0 2px 4px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.45)" }}
          >
            MIND MODULE
          </h1>
          <p
            className="relative text-xs tracking-[0.35em] uppercase text-white/90 font-body"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)" }}
          >
            Executive Edition
          </p>

          {/* Descriptive text — glass card for readability */}
          <div className="bg-white/15 backdrop-blur-md border border-white/40 rounded-3xl p-6 mt-8 max-w-sm mx-auto">
            <div className="space-y-4">
              <p className="text-[15px] text-white font-body leading-relaxed">
                Most leaders don't fail from lack of strategy. They fail from showing up scattered, ruminated, or burnt out.
              </p>
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                Mind Module is the executive cognitive performance layer for how you actually show up — under pressure, between decisions, across the week.
              </p>
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                The next few minutes are a two-way calibration: you get to know the app, and Mind Module gets to know your leadership context, your pressure points, and how your mind works under load.
              </p>
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                This isn't self-improvement. It's Self Mastery.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4 w-full mt-8">
          <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mb-2" />

          <Button
            size="lg"
            variant="critical"
            onClick={() => navigate("/onboarding/app-intro")}
            className="w-full max-w-sm text-[15px] font-medium py-6 px-12 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 rounded-2xl"
          >
            Let's begin
            <ArrowRight size={20} className="ml-2" />
          </Button>

          <div className="flex items-center gap-2 text-xs text-white/60 pt-2">
            <Shield size={14} className="text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
        </div>
      </div>
    </div>
  );
}
