import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import mmLogo from "@/assets/brand/mm-logo-circle.png";
import heroBg from "@/assets/onboarding/onboarding-welcome-active.jpg";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex flex-col items-center overflow-hidden animate-fade-in">
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
      <div className="relative z-10 flex flex-col items-center text-center h-full w-full px-5 py-4 max-w-4xl mx-auto">
        {/* Top section — logo + brand */}
        <div className="flex flex-col items-center space-y-4 mt-[38%] sm:mt-auto sm:flex-1 sm:justify-center">
          <img src={mmLogo} alt="Mind Module logo" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg" />

          <h1 className="text-5xl sm:text-7xl font-headline font-bold text-white tracking-wider leading-none uppercase">
            MIND MODULE
          </h1>
          <p className="text-[9px] sm:text-xs tracking-[0.35em] uppercase text-white/50 font-body -mt-1 sm:-mt-3">
            Executive Edition
          </p>

          {/* Descriptive text — glass card for readability */}
          <div className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 mt-8 max-w-sm mx-auto">
            <div className="space-y-4">
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                Most leaders don't fail from lack of strategy. They fail from showing up scattered, ruminated or burnt out.
              </p>
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                Six questions build your Leadership Performance Profile – the intelligence layer that makes everything personal to you and your day.
              </p>
              <p className="text-[15px] text-white/90 font-body leading-relaxed">
                The more honest you are, the sharper it gets.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="flex flex-col items-center gap-4 w-full mt-auto mb-[22%] sm:mb-auto sm:mt-8">
          <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mb-2" />

          <Button
            size="lg"
            variant="critical"
            onClick={() => navigate("/onboarding/identity")}
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
