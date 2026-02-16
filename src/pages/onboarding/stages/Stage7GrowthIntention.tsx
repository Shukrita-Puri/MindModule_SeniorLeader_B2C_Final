import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

export default function Stage7GrowthIntention() {
  const navigate = useNavigate();
  const [pressure, setPressure] = useState<string>(
    getResponse("pressure_context_tag") || ""
  );
  const [goal, setGoal] = useState<string>(
    getResponse("practice_priority_tag") || ""
  );

  const handleContinue = () => {
    saveResponse("pressure_context_tag", pressure);
    saveResponse("practice_priority_tag", goal);
    // Keep legacy key for backward compat
    saveResponse("growth_intention_response", goal);
    navigate("/onboarding/signup-step");
  };

  const pressureOptions = [
    { value: "high_stakes_decisions", label: "High-stakes decisions under uncertainty" },
    { value: "influence_stakeholders", label: "Leading / influencing difficult stakeholders" },
    { value: "conflict_navigation", label: "Navigating conflict or politics" },
    { value: "self_regulation", label: "Managing my own stress and energy" },
    { value: "cognitive_load", label: "Multiple competing priorities" },
  ];

  const goalOptions = [
    { value: "regulation_composure", label: "Staying calm and grounded under pressure" },
    { value: "regulation_early", label: "Managing stress before it escalates" },
    { value: "recovery_resilience", label: "Recovering faster from setbacks" },
    { value: "energy_endurance", label: "Sustaining energy without burning out" },
    { value: "focus_clarity", label: "Sharpening focus and cutting through brain fog" },
    { value: "mindset_reframe", label: "Reframing negative thoughts and rewiring patterns" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <QuestionCard 
        title="What's your biggest pressure point right now?"
        subtitle="Select one"
      >
        <div className="space-y-2.5 mt-5">
          {pressureOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPressure(option.value)}
              className={`w-full text-left p-3.5 border-2 rounded-lg transition-all ${
                pressure === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium text-sm">{option.label}</div>
            </button>
          ))}
        </div>
      </QuestionCard>

      <QuestionCard 
        title="What would make the biggest difference in how you show up?"
        subtitle="Select one"
      >
        <div className="space-y-2.5 mt-5">
          {goalOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setGoal(option.value)}
              className={`w-full text-left p-3.5 border-2 rounded-lg transition-all ${
                goal === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium text-sm">{option.label}</div>
            </button>
          ))}
        </div>
      </QuestionCard>

      <Button
        onClick={handleContinue}
        disabled={!pressure || !goal}
        size="lg"
        className="w-full"
      >
        See My Results
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
