import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { Briefcase, GraduationCap, Users, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Stage2Identity() {
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [identityType, setIdentityType] = useState<string>(
    getResponse("identity_type") || ""
  );
  const [customIdentity, setCustomIdentity] = useState<string>(
    getResponse("custom_identity") || ""
  );
  const [biggestPressure, setBiggestPressure] = useState<string>(
    getResponse("biggest_pressure") || ""
  );

  const identityOptions = [
    { value: "executive", label: "Senior Executive / Leader", icon: Briefcase },
    { value: "manager", label: "Manager / Team Leader", icon: Users },
    { value: "student", label: "Student / Learner", icon: GraduationCap },
    { value: "other", label: "Other", icon: Users },
  ];

  const getPressurePointsForIdentity = (): Array<{ value: string; label: string }> => {
    if (identityType === "student") {
      return [
        { value: "academic_performance", label: "Academic performance and test pressure" },
        { value: "leadership_social", label: "Leadership roles and social dynamics" },
        { value: "future_planning", label: "University applications and future planning" },
        { value: "stress_burnout", label: "Managing stress and avoiding burnout" },
        { value: "multiple_commitments", label: "Balancing multiple commitments" },
      ];
    }

    // Professionals (executive/manager/other)
    return [
      { value: "high_stakes_decisions", label: "High-stakes decisions under uncertainty" },
      { value: "difficult_stakeholders", label: "Leading/influencing difficult stakeholders" },
      { value: "conflict_politics", label: "Navigating conflict or politics" },
      { value: "stress_energy", label: "Managing my own stress and energy" },
      { value: "competing_priorities", label: "Multiple competing priorities" },
    ];
  };

  const handleContinue = () => {
    if (currentQuestion === 1) {
      saveResponse("identity_type", identityType);
      if (identityType === "other") {
        saveResponse("custom_identity", customIdentity);
      }
      setCurrentQuestion(2);
    } else {
      saveResponse("biggest_pressure", biggestPressure);
      navigate("/onboarding/energy-regulation");
    }
  };

  const canContinue = () => {
    if (currentQuestion === 1) {
      return identityType !== "" && (identityType !== "other" || customIdentity.trim() !== "");
    }
    if (currentQuestion === 2) {
      return biggestPressure !== "";
    }
    return false;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {currentQuestion === 1 && (
        <QuestionCard title="What describes you best?">
          <div className="space-y-3 mt-4">
            {identityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setIdentityType(option.value)}
                className={`w-full text-left p-4 border-2 rounded-lg transition-all flex items-center gap-3 ${
                  identityType === option.value
                    ? "border-gold bg-gold/5"
                    : "border-border hover:border-gold/50"
                }`}
              >
                <option.icon size={20} className="text-gold" />
                <span className="font-medium">{option.label}</span>
              </button>
            ))}

            {identityType === "other" && (
              <Input
                type="text"
                value={customIdentity}
                onChange={(e) => setCustomIdentity(e.target.value)}
                placeholder="Please specify..."
                className="mt-2"
              />
            )}
          </div>
        </QuestionCard>
      )}

      {currentQuestion === 2 && (
        <QuestionCard
          title="What's your biggest pressure point right now?"
          subtitle="Select the one that feels most challenging"
        >
          <div className="space-y-3 mt-4">
            {getPressurePointsForIdentity().map((option) => (
              <button
                key={option.value}
                onClick={() => setBiggestPressure(option.value)}
                className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                  biggestPressure === option.value
                    ? "border-gold bg-gold/5"
                    : "border-border hover:border-gold/50"
                }`}
              >
                <span className="text-sm font-body">{option.label}</span>
              </button>
            ))}
          </div>
        </QuestionCard>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue()}
        size="lg"
        className="w-full"
      >
        Continue
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
