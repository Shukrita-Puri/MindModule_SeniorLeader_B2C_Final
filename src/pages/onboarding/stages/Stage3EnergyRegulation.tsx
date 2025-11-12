import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";

export default function Stage3EnergyRegulation() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("energy_regulation_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("energy_regulation_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/focus-recovery");
    }, 300);
  };

  const options = [
    { 
      value: "naturally_unwind", 
      label: "Naturally unwind and disconnect",
      description: "I can switch off pretty easily after intense work"
    },
    { 
      value: "try_but_racing", 
      label: "Try to unwind but mind keeps racing",
      description: "I step away but my thoughts stay on work mode"
    },
    { 
      value: "stay_high_gear", 
      label: "Keep working or stay in high gear",
      description: "I find it hard to downshift during the day"
    },
    { 
      value: "feel_guilty", 
      label: "Feel guilty if I'm not being productive",
      description: "Stepping away feels like I'm falling behind"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="After a period of intense focus or high-pressure work, what happens?"
        subtitle="Think about how you transition after demanding tasks"
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
