import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";

export default function Stage4StressResponse() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("stress_response_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("stress_response_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/recovery-patterns");
    }, 300);
  };

  const options = [
    { 
      value: "stay_grounded", 
      label: "I can pause, breathe, and respond thoughtfully",
      description: "I maintain my center even when pressure intensifies"
    },
    { 
      value: "react_quickly", 
      label: "I react quickly, sometimes before I've fully processed",
      description: "I tend to respond fast—occasionally too fast"
    },
    { 
      value: "freeze_overthink", 
      label: "I freeze or overthink, struggling to act",
      description: "Analysis paralysis kicks in when stakes are high"
    },
    { 
      value: "power_through", 
      label: "I power through but feel drained afterward",
      description: "I get through it, but it costs me energy"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="In high-pressure moments, what's your default response?"
        subtitle="Think about crises, conflicts, negotiations, or unexpected challenges"
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
