import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { BenefitHook } from "@/components/onboarding/BenefitHook";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight, Target, TrendingUp, Flame, Shield, Sprout } from "lucide-react";

export default function Stage6GrowthAssessment() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("growth_priority") || ""
  );

  const handleContinue = () => {
    saveResponse("growth_priority", answer);
    navigate("/onboarding/signup-step");
  };

  const options = [
    { 
      value: "staying_composed_pressure", 
      label: "Staying composed under pressure",
      icon: Shield,
      description: "I want to pause before reacting in high-stakes moments"
    },
    { 
      value: "recovering_setbacks", 
      label: "Recovering faster from setbacks",
      icon: TrendingUp,
      description: "I want to bounce back quickly when things go wrong"
    },
    { 
      value: "maintaining_focus_chaos", 
      label: "Maintaining focus during chaos",
      icon: Target,
      description: "I want to stay on track when everything is competing for my attention"
    },
    { 
      value: "managing_energy_demands", 
      label: "Managing energy across demands",
      icon: Flame,
      description: "I want to sustain performance without burning out"
    },
    { 
      value: "building_resilience", 
      label: "Building long-term resilience",
      icon: Sprout,
      description: "I want foundational tools to handle whatever comes"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="What's your biggest growth priority right now?"
        subtitle="Select the one that feels most important to you"
      >
        <div className="space-y-3 mt-6">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => setAnswer(option.value)}
              className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                answer === option.value
                  ? "border-gold bg-gold/5"
                  : "border-border hover:border-gold/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <option.icon className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <BenefitHook message="Your baseline score will be calculated from these responses—showing where you start and mapping your fastest path to growth." />
      </QuestionCard>

      <Button
        onClick={handleContinue}
        disabled={!answer}
        size="lg"
        className="w-full"
      >
        See My Results
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
