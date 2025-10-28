import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { InsightCue } from "@/components/onboarding/InsightCue";
import { saveResponse, getResponse } from "@/utils/onboardingStorage";
import { ArrowRight } from "lucide-react";

const INSIGHTS = {
  q1: "Research shows that how you respond to setbacks predicts long-term achievement more than talent or initial ability. People who analyze and adapt after failure develop capabilities faster than those who simply work harder or give up. The encouraging news: this response pattern can be practiced and strengthened through deliberate scenarios. Your answer helps us understand your natural learning style.",
  
  q2: "Studies across thousands of professionals show that beliefs about ability shape how we approach challenges. People who see capability as developable persist longer, learn faster, and ultimately achieve more than those who view talent as fixed. The pattern you choose reveals how you interpret performance gaps—and that interpretation can be developed through awareness and practice.",
  
  q3: "Research on high-performing leaders shows that emotional regulation under pressure is one of the most trainable and improvable skills; and one of the highest leverage. Individuals who can regulate their emotional reactions in real-time score 40% higher on influence ratings than those who react immediately. Only 12% of people naturally pause before reacting under pressure—but this skill can be developed through practice of real world scenarios.",
  
  q4: "Studies of effective communicators reveal a surprising pattern: the best explainers don't explain better—they listen better first. Individuals who lead with curiosity about others' mental models are rated 40% higher in 'strategic influence' than those who lead with logic alone.",
  
  q5: "Research on achievement shows that sustained focus matters—but so does knowing when to adapt. People who balance consistent direction with strategic flexibility tend to advance faster than those who are either rigidly focused or constantly shifting. Your pattern reveals how you navigate the tension between commitment and adaptation—both are developable through practice.",
  
  q6: "The TalentSmart EQ assessment, validated across 2 million people, shows that leaders with strong self-awareness and social awareness create 2.3x more engaged teams. Most people overestimate their emotional awareness by 40-60%. Those who can track emotional and social dynamics while also managing content create better outcomes. This dual awareness develops through repeated practice in realistic scenarios.",
};

export default function Stage3Behavioral() {
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [showInsight, setShowInsight] = useState(false);
  
  const [q1, setQ1] = useState(getResponse("q1_setback_response") || "");
  const [q2, setQ2] = useState(getResponse("q2_performance_gap") || "");
  const [q3, setQ3] = useState(getResponse("q3_pressure_response") || "");
  const [q4, setQ4] = useState(getResponse("q4_communication_style") || "");
  const [q5, setQ5] = useState(getResponse("q5_consistency_pattern") || "");
  const [q6, setQ6] = useState<string[]>(getResponse("q6_emotional_awareness") || []);

  const getCurrentAnswer = () => {
    switch (currentQuestion) {
      case 1: return q1;
      case 2: return q2;
      case 3: return q3;
      case 4: return q4;
      case 5: return q5;
      case 6: return q6.length > 0;
      default: return false;
    }
  };

  const handleAnswerSelect = (value: string) => {
    switch (currentQuestion) {
      case 1: setQ1(value); break;
      case 2: setQ2(value); break;
      case 3: setQ3(value); break;
      case 4: setQ4(value); break;
      case 5: setQ5(value); break;
    }
    setShowInsight(true);
  };

  const handleQ6Toggle = (value: string) => {
    if (q6.includes(value)) {
      setQ6(q6.filter(v => v !== value));
    } else {
      setQ6([...q6, value]);
    }
  };

  const handleContinue = () => {
    const responseKey = `q${currentQuestion}_${
      currentQuestion === 1 ? "setback_response" :
      currentQuestion === 2 ? "performance_gap" :
      currentQuestion === 3 ? "pressure_response" :
      currentQuestion === 4 ? "communication_style" :
      currentQuestion === 5 ? "consistency_pattern" :
      "emotional_awareness"
    }`;
    
    const value = currentQuestion === 6 ? q6 : getCurrentAnswer();
    saveResponse(responseKey, value);

    if (currentQuestion === 6) {
      navigate("/onboarding/self-assessment");
      return;
    }

    setCurrentQuestion(currentQuestion + 1);
    setShowInsight(false);
  };

  const renderQuestion = () => {
    switch (currentQuestion) {
      case 1:
        return (
          <QuestionCard title="Think about the last time you faced a significant setback or failure in something important to you. What happened next?">
            <div className="space-y-3">
              {[
                { value: "analyzed", label: "I analyzed what went wrong and tried a different approach" },
                { value: "discouraged", label: "I felt discouraged and took a break before returning to it" },
                { value: "questioned", label: "I questioned whether I was cut out for this" },
                { value: "threw_back", label: "I immediately threw myself back into it with more effort" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q1 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>
        );

      case 2:
        return (
          <QuestionCard title="A colleague who started at the same time as you is consistently outperforming you in a key area. What's your honest first thought?">
            <div className="space-y-3">
              {[
                { value: "naturally_talented", label: "They're probably just naturally more talented at this" },
                { value: "learn_differently", label: "I wonder what they're doing differently that I could learn from" },
                { value: "work_harder", label: "This means I need to work harder and put in more hours" },
                { value: "built_for_it", label: "Some people are just built for this kind of work" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q2 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>
        );

      case 3:
        return (
          <QuestionCard title="You're in a high-stakes meeting. Someone publicly challenges your idea in a way that feels unfair or dismissive. In that moment, you typically:">
            <div className="space-y-3">
              {[
                { value: "pause", label: "Feel heat rising but pause before responding" },
                { value: "defend", label: "Immediately defend your position with data/logic" },
                { value: "flustered", label: "Feel flustered and struggle to think clearly" },
                { value: "calm", label: "Stay calm—criticism rarely affects me emotionally" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q3 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>
        );

      case 4:
        return (
          <QuestionCard title="You're explaining something you understand deeply to someone who sees it completely differently. Your instinct is to:">
            <div className="space-y-3">
              {[
                { value: "logic_steps", label: "Walk them through the logic step-by-step until they get it" },
                { value: "ask_questions", label: "Ask questions to understand their perspective first" },
                { value: "story_analogy", label: "Find a story or analogy that bridges both views" },
                { value: "frustrated", label: "Feel frustrated they're not seeing what's obvious to you" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q4 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>
        );

      case 5:
        return (
          <QuestionCard title="Looking at the past 2-3 years: Which statement is most true for you?">
            <div className="space-y-3">
              {[
                { value: "focused_goals", label: "I've maintained focus on 1-2 major goals the entire time" },
                { value: "shifted_learned", label: "My interests and priorities have shifted as I've learned and grown" },
                { value: "several_paths", label: "I've pursued several different paths as opportunities arose" },
                { value: "core_experiment", label: "I have a core direction, but I experiment within it" },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleAnswerSelect(option.value)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    q5 === option.value ? "border-gold bg-gold/5" : "border-border hover:border-gold/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </QuestionCard>
        );

      case 6:
        return (
          <QuestionCard 
            title="In a recent difficult conversation, how aware were you of:"
            subtitle="Select all that apply"
          >
            <div className="space-y-3">
              {[
                { value: "own_emotions", label: "What I was feeling in the moment (my emotions)" },
                { value: "own_why", label: "Why I was feeling that way (my triggers)" },
                { value: "others_emotions", label: "What the other person was feeling (their emotions)" },
                { value: "social_undercurrents", label: "The unspoken dynamics in the room (social undercurrents)" },
                { value: "content_focus", label: "Honestly, I was mostly focused on the content or task" },
              ].map(option => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-card cursor-pointer transition-all"
                >
                  <input
                    type="checkbox"
                    checked={q6.includes(option.value)}
                    onChange={() => handleQ6Toggle(option.value)}
                    className="w-4 h-4 accent-gold"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>

            {q6.length > 0 && (
              <Button
                onClick={() => setShowInsight(true)}
                variant="outline"
                className="w-full mt-4"
              >
                Continue
                <ArrowRight size={16} className="ml-2" />
              </Button>
            )}
          </QuestionCard>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {!showInsight ? (
        renderQuestion()
      ) : (
        <InsightCue
          content={INSIGHTS[`q${currentQuestion}` as keyof typeof INSIGHTS]}
          onContinue={handleContinue}
        />
      )}
    </div>
  );
}
