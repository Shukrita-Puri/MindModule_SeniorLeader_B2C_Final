import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

const INSIGHTS = {
  1: "Research shows that response to setbacks predicts achievement more than talent. This pattern can be strengthened through practice.",
  2: "Research shows emotional regulation is highly trainable and 40% more influential than IQ in leadership contexts.",
  3: "Surprising finding: Best communicators don't explain better—they listen better. Curiosity about others' mental models increases influence by 40%.",
};

export default function Stage3Behavioral() {
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [q1, setQ1] = useState<string>(getResponse("q1_setback_response") || "");
  const [q2, setQ2] = useState<string>(getResponse("q2_pressure_response") || "");
  const [q3, setQ3] = useState<string>(getResponse("q3_communication_style") || "");
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);

  const getCurrentAnswer = () => {
    switch (currentQuestion) {
      case 1:
        return q1;
      case 2:
        return q2;
      case 3:
        return q3;
      default:
        return false;
    }
  };

  const handleAnswerSelect = (value: string) => {
    switch (currentQuestion) {
      case 1:
        setQ1(value);
        break;
      case 2:
        setQ2(value);
        break;
      case 3:
        setQ3(value);
        break;
    }
  };

  const handleContinue = () => {
    const responseKey = currentQuestion === 1 
      ? "q1_setback_response" 
      : currentQuestion === 2 
      ? "q2_pressure_response" 
      : "q3_communication_style";
    const responseValue = currentQuestion === 1 ? q1 : currentQuestion === 2 ? q2 : q3;

    saveResponse(responseKey, responseValue);

    if (currentQuestion < 3) {
      setCurrentQuestion(currentQuestion + 1);
      setExpandedInsight(null);
    } else {
      navigate("/onboarding/self-assessment");
    }
  };

  const renderQuestion = () => {
    switch (currentQuestion) {
      case 1:
        return (
          <QuestionCard title="Last time something important didn't go as planned, you...">
            <div className="space-y-3 mt-4">
              {[
                {
                  value: "analyzed_adjusted",
                  label: "Analyzed what happened and adjusted your approach",
                },
                {
                  value: "took_break",
                  label: "Took a break to reset before trying again",
                },
                {
                  value: "pushed_through",
                  label: "Pushed through with more effort",
                },
                {
                  value: "questioned_path",
                  label: "Questioned if you were on the right path",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                    q1 === option.value
                      ? "border-gold bg-gold/5"
                      : "border-border hover:border-gold/50"
                  }`}
                >
                  <span className="text-sm font-body">{option.label}</span>
                </button>
              ))}
            </div>

            {expandedInsight === 1 ? (
              <div className="mt-4 p-4 bg-gold/5 border border-gold/20 rounded-lg">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  💡 <strong>Research insight:</strong> {INSIGHTS[1]}
                </p>
                <button
                  onClick={() => setExpandedInsight(null)}
                  className="text-xs text-gold mt-2 hover:underline"
                >
                  Hide
                </button>
              </div>
            ) : (
              <button
                onClick={() => setExpandedInsight(1)}
                className="mt-4 text-sm text-muted-foreground hover:text-gold transition-colors"
              >
                💡 Want to know why this matters?
              </button>
            )}
          </QuestionCard>
        );

      case 2:
        return (
          <QuestionCard title="In high-pressure moments, you typically...">
            <div className="space-y-3 mt-4">
              {[
                {
                  value: "pause_collect",
                  label: "Pause and collect your thoughts before reacting",
                },
                {
                  value: "stay_calm",
                  label: "Stay surprisingly calm—pressure doesn't rattle you",
                },
                {
                  value: "defend_explain",
                  label: "Jump to defend or explain immediately",
                },
                {
                  value: "flustered",
                  label: "Feel flustered and struggle to think clearly",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                    q2 === option.value
                      ? "border-gold bg-gold/5"
                      : "border-border hover:border-gold/50"
                  }`}
                >
                  <span className="text-sm font-body">{option.label}</span>
                </button>
              ))}
            </div>

            {expandedInsight === 2 ? (
              <div className="mt-4 p-4 bg-gold/5 border border-gold/20 rounded-lg">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  💡 <strong>Research insight:</strong> {INSIGHTS[2]}
                </p>
                <button
                  onClick={() => setExpandedInsight(null)}
                  className="text-xs text-gold mt-2 hover:underline"
                >
                  Hide
                </button>
              </div>
            ) : (
              <button
                onClick={() => setExpandedInsight(2)}
                className="mt-4 text-sm text-muted-foreground hover:text-gold transition-colors"
              >
                💡 Research insight
              </button>
            )}
          </QuestionCard>
        );

      case 3:
        return (
          <QuestionCard title="When explaining your perspective to someone who disagrees...">
            <div className="space-y-3 mt-4">
              {[
                {
                  value: "ask_questions",
                  label: "You ask questions to understand their view first",
                },
                {
                  value: "find_analogy",
                  label: "You find an analogy or story that bridges both views",
                },
                {
                  value: "walk_through_logic",
                  label: "You walk through your logic step-by-step",
                },
                {
                  value: "frustrated",
                  label: "You get frustrated they don't see what's obvious",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full text-left p-4 border-2 rounded-lg transition-all ${
                    q3 === option.value
                      ? "border-gold bg-gold/5"
                      : "border-border hover:border-gold/50"
                  }`}
                >
                  <span className="text-sm font-body">{option.label}</span>
                </button>
              ))}
            </div>

            {expandedInsight === 3 ? (
              <div className="mt-4 p-4 bg-gold/5 border border-gold/20 rounded-lg">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  💡 <strong>Surprising finding:</strong> {INSIGHTS[3]}
                </p>
                <button
                  onClick={() => setExpandedInsight(null)}
                  className="text-xs text-gold mt-2 hover:underline"
                >
                  Hide
                </button>
              </div>
            ) : (
              <button
                onClick={() => setExpandedInsight(3)}
                className="mt-4 text-sm text-muted-foreground hover:text-gold transition-colors"
              >
                💡 Surprising finding
              </button>
            )}
          </QuestionCard>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {renderQuestion()}

      <Button
        onClick={handleContinue}
        disabled={!getCurrentAnswer()}
        size="lg"
        className="w-full"
      >
        {currentQuestion === 3 ? "Continue to Self-Assessment" : "Continue"}
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
}
