import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

const GOAL_TO_PRESSURE: Record<string, string> = {
  regulation_composure: 'self_regulation',
  regulation_early: 'self_regulation',
  recovery_resilience: 'cognitive_load',
  energy_endurance: 'self_regulation',
  focus_clarity: 'cognitive_load',
  mindset_reframe: 'self_regulation',
};

export default function Stage7GrowthIntention() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState<string>(
    getResponse("practice_priority_tag") || ""
  );

  const handleContinue = () => {
    const derivedPressure = GOAL_TO_PRESSURE[goal] || 'self_regulation';
    saveResponse("pressure_context_tag", derivedPressure);
    saveResponse("practice_priority_tag", goal);
    saveResponse("growth_intention_response", goal);
    saveResponse("growth_intention", goal);
    navigate("/onboarding/signup-step");
  };

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
        title="What would make the biggest difference in how you show up?"
        subtitle="Select one"
      >
        <div className="space-y-2.5 mt-5">
          {goalOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setGoal(option.value)}
              className={`w-full text-left p-3.5 border rounded-xl transition-all ${
                goal === option.value
                  ? "border-saffron bg-saffron/5 shadow-sm"
                  : "border-black/[0.08] hover:border-saffron/30 bg-white/40"
              }`}
            >
              <div className="font-medium text-sm">{option.label}</div>
            </button>
          ))}
        </div>
      </QuestionCard>

      <Button
        onClick={handleContinue}
        disabled={!goal}
        size="lg"
        className="w-full bg-[#ff825a] text-white hover:bg-[#ff825a]/90 disabled:bg-[#ff825a]/50 border-[#ff855c] taupe-gradient-shine hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 active:scale-[0.98]"
      >
        See My Results
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
