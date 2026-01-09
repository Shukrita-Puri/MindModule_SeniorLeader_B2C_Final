import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

export default function Stage7GrowthIntention() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string>(
    getResponse("growth_intention_response") || ""
  );

  const handleContinue = () => {
    saveResponse("growth_intention_response", answer);
    navigate("/onboarding/signup-step");
  };

  const options = [
    { 
      value: "stay_calm_pressure", 
      label: "Staying calm and grounded under pressure",
      description: "I want to maintain composure in high-stakes moments"
    },
    { 
      value: "manage_anxiety", 
      label: "Managing stress and anxiety before they escalate",
      description: "I want to catch and regulate stress earlier"
    },
    { 
      value: "recover_faster", 
      label: "Recovering faster from setbacks and difficult days",
      description: "I want to bounce back more quickly"
    },
    { 
      value: "sustain_energy", 
      label: "Sustaining energy without burning out",
      description: "I want to maintain performance over the long haul"
    },
    { 
      value: "sharpen_focus", 
      label: "Sharpening focus and cutting through brain fog",
      description: "I want mental clarity when it matters most"
    },
    { 
      value: "reframe_rewire", 
      label: "Reframing negative thoughts and rewiring patterns",
      description: "I want to change unhelpful mental habits"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="What would make the biggest difference in how you show up for high-stakes moments?"
        subtitle="Select the one that feels most important to you right now"
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
              <div className="flex-1">
                <div className="font-medium text-sm mb-1">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
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
        See My Results
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
