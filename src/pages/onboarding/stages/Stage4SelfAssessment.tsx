import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { BenefitHook } from "@/components/onboarding/BenefitHook";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

export default function Stage4SelfAssessment() {
  const navigate = useNavigate();
  const [showTransition, setShowTransition] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  
  const [q7, setQ7] = useState(getResponse("q7_self_assessed_strength") || "");
  const [q8, setQ8] = useState(getResponse("q8_development_area") || "");
  const [q9, setQ9] = useState(getResponse("q9_pressure_behavior") || "");
  const [q10, setQ10] = useState(getResponse("q10_performance_barrier") || "");

  if (showTransition) {
    return (
      <div className="space-y-8 py-12 animate-fade-in text-center">
        <h2 className="text-3xl font-headline font-bold text-foreground">
          Understanding Your Self-View
        </h2>
        <p className="text-lg text-muted-foreground font-body max-w-lg mx-auto">
          You've answered 6 questions about behavior. Now let's see how you perceive yourself.
        </p>
        <div className="bg-gold/5 border border-gold/20 rounded-lg p-6 max-w-md mx-auto">
          <p className="text-sm text-foreground/80 italic">
            Research shows most people have blind spots about their strengths and development areas. Your self-perception vs. actual patterns reveals powerful insights.
          </p>
        </div>
        <Button size="lg" onClick={() => setShowTransition(false)} className="w-full max-w-sm">
          Continue
          <ArrowRight size={20} className="ml-2" />
        </Button>
      </div>
    );
  }

  const handleAnswer = (value: string) => {
    switch (currentQuestion) {
      case 1: setQ7(value); break;
      case 2: setQ8(value); break;
      case 3: setQ9(value); break;
      case 4: setQ10(value); break;
    }
  };

  const handleContinue = () => {
    const responseKey = `q${currentQuestion + 6}_${
      currentQuestion === 1 ? "self_assessed_strength" :
      currentQuestion === 2 ? "development_area" :
      currentQuestion === 3 ? "pressure_behavior" :
      "performance_barrier"
    }`;
    
    saveResponse(responseKey, 
      currentQuestion === 1 ? q7 :
      currentQuestion === 2 ? q8 :
      currentQuestion === 3 ? q9 :
      q10
    );

    if (currentQuestion === 4) {
      navigate("/signup");
      return;
    }

    setCurrentQuestion(currentQuestion + 1);
  };

  const canContinue = () => {
    switch (currentQuestion) {
      case 1: return q7 !== "";
      case 2: return q8 !== "";
      case 3: return q9 !== "";
      case 4: return q10 !== "";
      default: return false;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {currentQuestion === 1 && (
        <>
          <QuestionCard title="Which ONE feels like your strongest natural capability?">
            <div className="space-y-3">
              {[
                { value: "ALA", label: "Adaptability & Learning Agility", desc: "Learning fast, pivoting when needed" },
                { value: "CSI", label: "Communication & Social Intelligence", desc: "Reading people, influencing outcomes" },
                { value: "SRR", label: "Self-Regulation & Resilience", desc: "Staying composed under pressure" },
                { value: "none", label: "None of these feel like strengths yet" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q7 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  {option.desc && <div className="text-sm text-muted-foreground mt-1">{option.desc}</div>}
                </button>
              ))}
            </div>
          </QuestionCard>

          {q7 && (
            <BenefitHook message="Mind Module helps turn awareness into capability through realistic role-play scenarios. You'll practice actual situations—high-stakes meetings, difficult conversations, strategic decisions—with real-time prompts to strengthen these skills." />
          )}
        </>
      )}

      {currentQuestion === 2 && (
        <>
          <QuestionCard title="Which ONE area do you most want to develop?">
            <div className="space-y-3">
              {[
                { value: "ALA", label: "Adaptability & Learning Agility", desc: "I struggle when plans change or I need to pivot quickly" },
                { value: "CSI", label: "Communication & Social Intelligence", desc: "I find it hard to influence others or read social dynamics" },
                { value: "SRR", label: "Self-Regulation & Resilience", desc: "I get overwhelmed or reactive under pressure" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q8 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-muted-foreground mt-1">{option.desc}</div>
                </button>
              ))}
            </div>
          </QuestionCard>

          {q8 && (
            <BenefitHook message="Here's how Mind Module works: Practice → Real-time prompts → Regulate → Connect context. You get scenarios targeting your development area, with prompts that help you stay regulated and think clearly in the moment." />
          )}
        </>
      )}

      {currentQuestion === 3 && (
        <QuestionCard title="How do you usually respond under high-pressure moments?">
          <div className="space-y-3">
            {[
              { value: "slow_analyze", label: "Slow down and analyze everything" },
              { value: "act_fast", label: "Act fast to regain control" },
              { value: "freeze", label: "Freeze or overthink" },
              { value: "shift_others", label: "Shift focus to others' needs" },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  q9 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {q9 && (
            <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-foreground/80">
                Mind Module balances training using <strong>Pause</strong> (nervous system regulation), <strong>Flow</strong> (energy optimization), and <strong>Re-Energize</strong> (recovery protocols).
              </p>
            </div>
          )}
        </QuestionCard>
      )}

      {currentQuestion === 4 && (
        <>
          <QuestionCard title="When you need to perform at your best, what's your biggest barrier?">
            <div className="space-y-3">
              {[
                { value: "mental_fog", label: "Mental fog or lack of clarity" },
                { value: "emotional_reactivity", label: "Emotional reactivity" },
                { value: "energy_depletion", label: "Energy depletion" },
                { value: "all_above", label: "All of the above" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q10 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>

          {q10 && (
            <div className="mt-4 p-4 bg-gold/5 border border-gold/20 rounded-lg">
              <p className="text-sm text-foreground/80">
                Your primary barrier determines your starting protocol focus. Mind Module tracks your state patterns and adapts recommendations to what your nervous system needs most.
              </p>
            </div>
          )}
        </>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue()}
        size="lg"
        className="w-full"
      >
        {currentQuestion === 4 ? "See My Results" : "Continue"}
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
