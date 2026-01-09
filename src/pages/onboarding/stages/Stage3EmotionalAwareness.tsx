import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";

export default function Stage3EmotionalAwareness() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("emotional_awareness_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("emotional_awareness_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/stress-response");
    }, 300);
  };

  const options = [
    { 
      value: "notice_early", 
      label: "I notice it early and can name what I'm feeling",
      description: "I'm aware of my emotional state as it shifts"
    },
    { 
      value: "physical_signs", 
      label: "I feel it in my body first",
      description: "Tension, racing heart, or shallow breathing signals me before I recognize the emotion"
    },
    { 
      value: "realize_after", 
      label: "I often realize I was stressed after the moment passes",
      description: "In the moment, I'm focused on the task, not my state"
    },
    { 
      value: "push_through", 
      label: "I push through and deal with feelings later",
      description: "I prioritize performance over processing emotions in the moment"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="When stress starts building during a high-stakes moment, what happens first?"
        subtitle="Think about board meetings, difficult conversations, or crisis moments"
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
