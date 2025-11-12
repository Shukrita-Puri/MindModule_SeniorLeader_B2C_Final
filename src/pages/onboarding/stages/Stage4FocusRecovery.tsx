import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { OnboardingBackButton } from "@/components/onboarding/OnboardingBackButton";

export default function Stage4FocusRecovery() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("focus_recovery_response") || ""
  );

  const handleSelectAnswer = (value: string) => {
    setAnswer(value);
    saveResponse("focus_recovery_response", value);
    
    // Auto-advance after 300ms
    setTimeout(() => {
      navigate("/onboarding/energy-renewal");
    }, 300);
  };

  const options = [
    { 
      value: "re_establish_quickly", 
      label: "Re-establish focus within a minute or two",
      description: "I can get back on track pretty fast"
    },
    { 
      value: "take_5_10_minutes", 
      label: "Take 5-10 minutes with a quick reset",
      description: "I need a brief pause to refocus"
    },
    { 
      value: "struggle_to_recover", 
      label: "Struggle to get back on track",
      description: "It takes me a while to find my flow again"
    },
    { 
      value: "get_frustrated", 
      label: "Get frustrated and lose momentum",
      description: "Interruptions derail me for a significant time"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <OnboardingBackButton backPath="/onboarding/energy-regulation" />
        <QuestionCard 
          title="When you're interrupted during deep work, how do you recover your focus?"
          subtitle="Think about emails, calls, or unexpected asks"
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
