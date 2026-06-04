import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";

export default function Stage5RecoveryPatterns() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("recovery_patterns_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("recovery_patterns_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/mental-clarity");
    }, 300);
  };

  const options = [
    { 
      value: "bounce_back", 
      label: "I bounce back within a day or two",
    },
    { 
      value: "weekend_recover", 
      label: "I need the full weekend to recover",
    },
    { 
      value: "accumulating_fatigue", 
      label: "Fatigue accumulates even with rest",
    },
    { 
      value: "always_tired", 
      label: "I'm consistently running on empty",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="After a demanding week, how do you typically feel?"
        subtitle="Think about back-to-back meetings, difficult conversations, crisis mode"
      >
        <div className="space-y-3 mt-6">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelectAnswer(option.value)}
              className={`w-full text-left p-4 border rounded-xl transition-all ${
                answer === option.value
                  ? "border-saffron bg-saffron/5 shadow-sm"
                  : "border-[#cfc7b8] hover:border-saffron/30 bg-white"
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
