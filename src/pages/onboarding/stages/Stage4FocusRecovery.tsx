import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight, Target, AlertCircle } from "lucide-react";

export default function Stage4FocusRecovery() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("focus_recovery_response") || ""
  );

  const handleContinue = () => {
    saveResponse("focus_recovery_response", answer);
    navigate("/onboarding/energy-renewal");
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
      <QuestionCard 
        title="When you're interrupted during deep work, how do you recover your focus?"
        subtitle="Think about emails, calls, or unexpected asks"
      >
        <div className="space-y-3 mt-6">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => setAnswer(option.value)}
              className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                answer === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {option.value === "re_establish_quickly" ? (
                    <Target className="w-5 h-5 text-primary" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </QuestionCard>

      <Button
        onClick={handleContinue}
        disabled={!answer}
        size="lg"
        className="w-full"
      >
        Continue
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
