import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { Input } from "@/components/ui/input";

export default function Stage2Identity() {
  const navigate = useNavigate();
  const location = useLocation();
  const savedIdentityType = getResponse("identity_type") || "";
  const savedBiggestPressure = getResponse("biggest_pressure") || "";
  const returnToQuestion = (location.state as { returnToQuestion?: number } | null)?.returnToQuestion;
  const [currentQuestion, setCurrentQuestion] = useState(() => (
    returnToQuestion === 2 ? 2 : 1
  ));
  const [identityType, setIdentityType] = useState<string>(
    savedIdentityType
  );
  const [customIdentity, setCustomIdentity] = useState<string>(
    getResponse("custom_identity") || ""
  );
  const [biggestPressure, setBiggestPressure] = useState<string>(
    savedBiggestPressure
  );

  // Intercept the top-bar Back button when on Q2: step back to Q1 instead of leaving the page.
  useEffect(() => {
    const onBack = (e: Event) => {
      if (currentQuestion === 2) {
        e.preventDefault();
        setCurrentQuestion(1);
      }
    };
    window.addEventListener('onboarding:back', onBack as EventListener);
    return () => window.removeEventListener('onboarding:back', onBack as EventListener);
  }, [currentQuestion]);

  const identityOptions = [
    { value: "executive", label: "Executive / Organisation Leader" },
    { value: "manager", label: "Manager / People Leader" },
    { value: "other", label: "Others" },
  ];

  const getPressurePointsForIdentity = (): Array<{ value: string; label: string }> => {
    // ARCHIVED: Student questions kept for future expansion
    // if (identityType === "student") {
    //   return [
    //     { value: "academic_performance", label: "Academic performance and test pressure" },
    //     { value: "leadership_social", label: "Leadership roles and social dynamics" },
    //     { value: "future_planning", label: "University applications and future planning" },
    //     { value: "stress_burnout", label: "Managing stress and avoiding burnout" },
    //     { value: "multiple_commitments", label: "Balancing multiple commitments" },
    //   ];
    // }

    // Executive/Professional pressure points (MVP focus)
    return [
      { value: "high_stakes_decisions", label: "High-stakes decisions under uncertainty" },
      { value: "difficult_stakeholders", label: "Leading/influencing difficult stakeholders" },
      { value: "conflict_politics", label: "Navigating conflict or politics" },
      { value: "stress_energy", label: "Managing my own stress and energy" },
      { value: "competing_priorities", label: "Multiple competing priorities" },
    ];
  };

  const handleIdentitySelect = (value: string) => {
    setIdentityType(value);
    saveResponse("identity_type", value);
    
    // Auto-advance to Q2 after brief delay (unless "other" selected)
    if (value !== "other") {
      setTimeout(() => {
        setCurrentQuestion(2);
      }, 300);
    }
  };

  const handlePressureSelect = (value: string) => {
    setBiggestPressure(value);
    saveResponse("biggest_pressure", value);
    
    // Auto-advance to next stage after brief delay
    setTimeout(() => {
      navigate("/onboarding/emotional-awareness");
    }, 300);
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
          <div className="space-y-3 mt-6">
            {identityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleIdentitySelect(option.value)}
                className={`w-full text-left p-4 border rounded-xl transition-all ${
                  identityType === option.value
                    ? "border-saffron bg-saffron/5 shadow-sm"
                    : "border-[#cfc7b8] hover:border-saffron/30 bg-white"
                }`}
              >
                <span className="font-medium text-sm">{option.label}</span>
              </button>
            ))}

            {identityType === "other" && (
              <div className="mt-4 space-y-3">
                <Input
                  type="text"
                  value={customIdentity}
                  onChange={(e) => setCustomIdentity(e.target.value)}
                  placeholder="Please specify..."
                  className="mt-2"
                />
                <button
                  onClick={() => {
                    if (customIdentity.trim()) {
                      saveResponse("custom_identity", customIdentity);
                      setTimeout(() => setCurrentQuestion(2), 300);
                    }
                  }}
                  disabled={!customIdentity.trim()}
                  className="w-full p-3 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        </QuestionCard>
      )}

      {currentQuestion === 2 && (
        <QuestionCard
          title="What's your biggest pressure point right now?"
          subtitle="Select the one that feels most challenging"
        >
          <div className="space-y-3 mt-6">
            {getPressurePointsForIdentity().map((option) => (
              <button
                key={option.value}
                onClick={() => handlePressureSelect(option.value)}
                className={`w-full text-left p-4 border rounded-xl transition-all ${
                  biggestPressure === option.value
                    ? "border-saffron bg-saffron/5 shadow-sm"
                    : "border-[#cfc7b8] hover:border-saffron/30 bg-white"
                }`}
              >
                <span className="text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </QuestionCard>
      )}
    </div>
  );
}
