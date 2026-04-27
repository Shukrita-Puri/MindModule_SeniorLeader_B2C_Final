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
    },
    { 
      value: "physical_signs", 
      label: "I feel it in my body first",
    },
    { 
      value: "realize_after", 
      label: "I often realize I was stressed after the moment passes",
    },
    { 
      value: "push_through", 
      label: "I push through and deal with feelings later",
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
              className={`w-full text-left p-4 border rounded-xl transition-all ${
                answer === option.value
                  ? "border-saffron bg-saffron/5 shadow-sm"
                  : "border-black/[0.08] hover:border-saffron/30 bg-white/40"
              }`}
            >
              <div className="flex-1">
                <div className="font-medium text-sm mb-1 font-body">{option.label}</div>
              </div>
            </button>
          ))}
        </div>
      </QuestionCard>
    </div>
  );
}
