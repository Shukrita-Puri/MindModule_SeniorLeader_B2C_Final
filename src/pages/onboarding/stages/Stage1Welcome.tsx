import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Target, TrendingUp, Zap, Shield, Lock, CheckCircle, MessageCircle, BarChart3 } from "lucide-react";
import { GoldDivider } from "@/components/ui/divider";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 py-12 animate-fade-in">
      {/* Radial gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-mocha/5 pointer-events-none -z-10" />
      
      {/* Top decorative gold line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gold/40 animate-fade-in" />
      
      <div className="flex justify-center animate-fade-in">
        <div className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-gradient-to-br from-gold/30 via-primary/20 to-gold/30 flex items-center justify-center animate-pulse">
          <Brain size={80} className="text-primary md:w-24 md:h-24" />
        </div>
      </div>

      <div className="text-center space-y-4 animate-fade-in delay-100">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-display font-bold text-foreground tracking-wide">
          Welcome to<br/>MIND MODULE
        </h1>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-editorial italic text-primary font-medium tracking-wide">
          Proactive Self Mastery for Peak Performers
        </h2>
      </div>

      <GoldDivider />

      <div className="bg-card/80 backdrop-blur-sm border border-gold/20 rounded-xl p-8 space-y-5 animate-fade-in delay-200">
        <p className="text-base text-foreground/90 leading-relaxed">
          Before we begin, let's understand your starting point.
        </p>
        
        <p className="text-lg text-foreground/90 leading-relaxed font-medium">
          Answer a few questions (~5 minutes). You'll discover:
        </p>

        <ul className="space-y-4">
          {[
            { icon: Target, text: "Your natural thinking patterns" },
            { icon: TrendingUp, text: "Where you're strongest" },
            { icon: Zap, text: "Your fastest path to improvement" },
          ].map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <item.icon size={16} className="text-gold" />
              </div>
              <span className="text-base text-foreground/80">{item.text}</span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground italic pt-4 border-t border-gold/10">
          Everything you need to master high-pressure moments starts with knowing where you are today.
        </p>
      </div>

      {/* How It Works Section */}
      <div className="bg-muted/30 backdrop-blur-sm border border-border rounded-xl p-6 space-y-4 animate-fade-in delay-250">
        <p className="text-sm font-medium text-foreground/90 uppercase tracking-wider">How It Works</p>
        <ul className="space-y-3">
          {[
            { icon: CheckCircle, text: "Daily Check-ins to calibrate your inner state" },
            { icon: Zap, text: "AI-curated Performance Plans matched to your energy" },
            { icon: MessageCircle, text: "Self Mastery Coach for real-time guidance" },
            { icon: BarChart3, text: "Insights dashboard tracking your growth over time" },
          ].map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <item.icon size={16} className="text-primary/70 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/70">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Privacy continuity footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 animate-fade-in delay-300">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-gold/60" />
          <span>Privacy by Design</span>
        </div>
        <span className="text-gold/40">•</span>
        <div className="flex items-center gap-1.5">
          <Lock size={14} className="text-gold/60" />
          <span>Data Stays Local</span>
        </div>
      </div>

      <Button
        size="lg"
        onClick={() => navigate("/onboarding/identity")}
        className="w-full text-lg py-6 px-12 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in delay-400"
      >
        Discover My Baseline
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
