import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { BenefitHook } from "@/components/onboarding/BenefitHook";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

export default function Stage4SelfAssessment() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("q4_self_assessed_strength") || ""
  );

  const handleContinue = () => {
    saveResponse("q4_self_assessed_strength", answer);
    navigate("/signup");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard title="Which feels truest about you right now?">
        <div className="space-y-3 mt-4">
          {[
            { value: "ALA", label: "I adapt well when things change" },
            { value: "CSI", label: "I connect well with others and read the room" },
            { value: "SRR", label: "I stay composed under pressure" },
            { value: "none", label: "I'm still building these capabilities" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setAnswer(option.value)}
              className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                answer === option.value
                  ? "border-gold bg-gold/5"
                  : "border-border hover:border-gold/50"
              }`}
            >
              <span className="text-sm font-body">{option.label}</span>
            </button>
          ))}
        </div>

        <BenefitHook message="Mind Module helps turn awareness into capability through realistic practice. You'll strengthen these skills in actual scenarios—meetings, decisions, tough conversations." />
      </QuestionCard>

      <Button
        onClick={handleContinue}
        disabled={!answer}
        size="lg"
        className="w-full"
      >
        See My Results
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
}
