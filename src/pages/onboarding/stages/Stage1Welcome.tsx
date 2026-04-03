import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import mmLogo from "@/assets/brand/mm-logo-circle.png";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 py-12 animate-fade-in">
      <div className="flex justify-center animate-fade-in">
        <div className="w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center">
          <img src={mmLogo} alt="Mind Module" className="w-full h-full object-contain rounded-full" />
        </div>
      </div>

      <div className="text-center space-y-4 animate-fade-in delay-100">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-headline text-foreground tracking-tight">
          Welcome to<br/>MIND MODULE
        </h1>
      </div>

      <div className="bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] animate-fade-in delay-200 space-y-5">
        <p className="text-base text-foreground/90 font-body leading-relaxed">
          Most leaders don't fail from lack of strategy. They fail from showing up scattered, ruminated or burnt out.
        </p>
        <p className="text-base text-foreground/90 font-body leading-relaxed">
          Six questions build your Leadership Performance Profile — the intelligence layer that makes everything personal to you and your day.
        </p>
        <p className="text-base text-foreground/90 font-body leading-relaxed">
          The more honest you are, the sharper it gets.
        </p>
      </div>

      <Button
        size="lg"
        variant="critical"
        onClick={() => navigate("/onboarding/identity")}
        className="w-full text-lg py-6 px-12 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in delay-400"
      >
        Let's begin
        <ArrowRight size={20} className="ml-2" />
      </Button>

      {/* Privacy continuity footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2 animate-fade-in delay-300">
        <Shield size={14} className="text-saffron/60" />
        <span>Privacy by Design</span>
      </div>
    </div>
  );
}
