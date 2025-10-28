import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Target, TrendingUp, Zap } from "lucide-react";

export default function Stage1Welcome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 py-12 animate-fade-in">
      <div className="flex justify-center">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center">
          <Brain size={64} className="text-primary" />
        </div>
      </div>

      <div className="text-center space-y-4">
        <h1 className="text-4xl font-headline font-bold text-foreground">
          Welcome to Mind Module
        </h1>
        <p className="text-lg text-muted-foreground font-body max-w-lg mx-auto">
          Your proactive thinking partner for mind mastery.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <p className="text-base text-foreground/90 leading-relaxed">
          Before we begin, let's understand your starting point.
        </p>
        
        <p className="text-base text-foreground/90 leading-relaxed font-medium">
          Answer a few questions (7 minutes). You'll discover:
        </p>

        <ul className="space-y-3">
          {[
            { icon: Target, text: "Your natural thinking patterns" },
            { icon: TrendingUp, text: "Where you're strongest" },
            { icon: Zap, text: "Your fastest path to improvement" },
          ].map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <item.icon size={14} className="text-gold" />
              </div>
              <span className="text-sm text-foreground/80">{item.text}</span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground italic pt-2">
          Everything you need to master high-pressure moments that matter to you starts with knowing where you are today.
        </p>
      </div>

      <Button
        size="lg"
        onClick={() => navigate("/onboarding/identity")}
        className="w-full text-lg py-6"
      >
        Discover My Baseline
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
