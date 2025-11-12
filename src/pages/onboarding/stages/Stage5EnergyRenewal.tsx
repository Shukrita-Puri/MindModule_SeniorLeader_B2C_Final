import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { OnboardingBackButton } from "@/components/onboarding/OnboardingBackButton";

export default function Stage5EnergyRenewal() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("energy_renewal_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("energy_renewal_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/growth-assessment");
    }, 300);
  };

  const options = [
    { 
      value: "go_to_strategies", 
      label: "Have go-to strategies that work well",
      description: "I know what helps me recharge"
    },
    { 
      value: "step_away_partial", 
      label: "Step away but don't feel fully recharged",
      description: "I take breaks but they don't restore me completely"
    },
    { 
      value: "push_through_caffeine", 
      label: "Push through with caffeine or willpower",
      description: "I rely on stimulants to keep going"
    },
    { 
      value: "no_strategies", 
      label: "Don't really have effective strategies",
      description: "I'm not sure what actually helps"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <OnboardingBackButton backPath="/onboarding/focus-recovery" />
        <QuestionCard 
          title="When you're mentally drained but still have hours to go, what do you do?"
          subtitle="Think about mid-afternoon slumps or late-day fatigue"
        >
          <div className="space-y-3 mt-6">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelectAnswer(option.value)}
                className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                  answer === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </button>
            ))}
          </div>
        </QuestionCard>
    </div>
  );
}
