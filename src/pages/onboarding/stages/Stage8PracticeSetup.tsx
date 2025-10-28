import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse, clearSession } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

export default function Stage8PracticeSetup() {
  const navigate = useNavigate();
  const [practiceTime, setPracticeTime] = useState(getResponse("preferred_practice_time") || "");
  const developmentArea = getResponse("q8_development_area");

  const handleFinish = () => {
    saveResponse("preferred_practice_time", practiceTime);
    clearSession();
    navigate("/executive-home");
  };

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      <div className="text-center">
        <h2 className="text-3xl font-headline font-bold mb-2">Your Practice Focus</h2>
        <p className="text-lg text-muted-foreground">We'll prioritize scenarios that strengthen your development area</p>
      </div>

      <div className="bg-gold/5 border border-gold/20 rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-2">Primary Development Area</p>
        <p className="text-xl font-semibold text-gold">
          {developmentArea === 'ALA' ? 'Adaptability & Learning Agility' :
           developmentArea === 'CSI' ? 'Communication & Social Intelligence' :
           'Self-Regulation & Resilience'}
        </p>
      </div>

      <QuestionCard title="When do you typically have 10-15 minutes for practice?">
        <div className="space-y-3">
          {[
            { value: "morning", label: "Start of Day (6am-10am)" },
            { value: "afternoon", label: "Half Day (12pm-3pm)" },
            { value: "evening", label: "End of Day (6pm-10pm)" },
            { value: "varies", label: "It varies" },
          ].map(option => (
            <button
              key={option.value}
              onClick={() => setPracticeTime(option.value)}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                practiceTime === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </QuestionCard>

      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-sm leading-relaxed text-center">
          Research shows <strong>3-4 practice sessions per week</strong> lead to measurable improvement within <strong>21-30 days</strong>
        </p>
      </div>

      <Button
        size="lg"
        onClick={handleFinish}
        disabled={!practiceTime}
        className="w-full"
      >
        Go to Dashboard
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
