import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Shield, Lock } from "lucide-react";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 py-12 animate-fade-in">
      <div className="flex justify-center animate-fade-in">
        <div className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/20 flex items-center justify-center animate-pulse">
          <Brain size={80} className="text-primary md:w-24 md:h-24" />
        </div>
      </div>

      <div className="text-center space-y-4 animate-fade-in delay-100">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-headline text-foreground tracking-tight">
          Welcome to<br/>MIND MODULE
        </h1>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-subheadline text-primary font-medium tracking-wide">
          Proactive Self Mastery for Peak Performers
        </h2>
      </div>

      <div className="bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] animate-fade-in delay-200">
        <p className="text-base text-foreground/90 font-body leading-relaxed">
          This takes three minutes. Your answers shape everything the app surfaces for you — your practices, your daily brief, your coaching. The more honest you are, the more precisely it works.
        </p>
      </div>

      {/* Privacy continuity footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 animate-fade-in delay-300">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-primary/60" />
          <span>Privacy by Design</span>
        </div>
        <span className="text-primary/40">•</span>
        <div className="flex items-center gap-1.5">
          <Lock size={14} className="text-primary/60" />
          <span>Data Stays Local</span>
        </div>
      </div>

      <Button
        size="lg"
        variant="critical"
        onClick={() => navigate("/onboarding/identity")}
        className="w-full text-lg py-6 px-12 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in delay-400"
      >
        Begin
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
