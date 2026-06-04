import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";

export default function Stage6MentalClarity() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("mental_clarity_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("mental_clarity_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/growth-intention");
    }, 300);
  };

  const options = [
    { 
      value: "crystal_clear", 
      label: "I can cut through noise and prioritize what matters",
    },
    { 
      value: "mostly_clear", 
      label: "Mostly clear, but I occasionally lose the thread",
    },
    { 
      value: "fog_creeps", 
      label: "Brain fog creeps in and I struggle to focus",
    },
    { 
      value: "overwhelmed", 
      label: "I feel overwhelmed and everything feels equally urgent",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="When juggling multiple priorities and cognitive demands, how clear is your thinking?"
        subtitle="Think about busy periods with competing deadlines and decisions"
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
