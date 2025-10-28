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
  
  const [identityType, setIdentityType] = useState(getResponse("identity_type") || "");
  const [customIdentity, setCustomIdentity] = useState(getResponse("custom_identity") || "");
  const [challenges, setChallenges] = useState<string[]>(getResponse("challenges") || []);
  const [mentalBandwidth, setMentalBandwidth] = useState<string[]>(getResponse("mental_bandwidth") || []);
  const [scenarioFrequency, setScenarioFrequency] = useState(
    getResponse("scenario_frequency") || {
      think_on_feet: 3,
      difficult_conversations: 3,
      incomplete_information: 3,
      regulate_stress: 3,
    }
  );

  const identityOptions = [
    { value: "executive", label: "Senior Executive / Leader", icon: Briefcase },
    { value: "manager", label: "Manager / Team Leader", icon: Users },
    { value: "student", label: "Student / Learner", icon: GraduationCap },
    { value: "other", label: "Other (write-in)", icon: Users },
  ];

  const getChallengesForIdentity = () => {
    if (identityType === "student") {
      return [
        "Academic performance under pressure",
        "Interview preparation",
        "Building Leadership and group dynamics/influence",
        "Mental clarity and composure under pressure",
        "Avoiding burnout and maintaining edge",
        "Managing stress / not becoming overwhelmed",
        "Career clarity and decision-making",
        "Learning complex concepts quickly",
      ];
    }
    return [
      "Strategic decisions under uncertainty",
      "Leading and influencing others",
      "Managing stakeholder complexity",
      "High-stakes negotiations or conversations",
      "Personal Performance and energy management",
      "Mental clarity and composure under pressure",
      "Avoiding burnout and maintaining edge",
      "Navigating organizational politics",
      "Innovation and adaptive thinking",
      "Managing multiple priorities",
      "Recalibrating focus",
    ];
  };

  const getMentalBandwidthOptions = () => {
    if (identityType === "student") {
      return [
        "Academic performance and grades",
        "University applications and admissions stress",
        "Managing multiple commitments (academics, activities, social)",
        "Test anxiety and performance pressure",
        "Leadership roles (captain, prefect, club leader)",
        "Social dynamics and peer relationships",
        "Public speaking or competitive events",
        "Balancing expectations from teachers, parents, and self",
      ];
    }
    
    if (identityType === "executive") {
      return [
        "Board dynamics and governance",
        "Strategic decisions under uncertainty",
        "Enterprise-scale transformation or change",
        "Stakeholder management (investors, board, leadership)",
        "High-stakes negotiations or M&A",
        "Public/media presence and reputation management",
        "Organizational politics and influence",
        "Personal performance and executive presence",
      ];
    }

    return [
      "Managing up and influencing senior leadership",
      "Leading and developing your team",
      "Cross-functional stakeholder alignment",
      "Navigating organizational politics",
      "High-stakes presentations or proposals",
      "Career advancement and visibility",
      "Managing multiple competing priorities",
      "Work-life balance and sustainable performance",
    ];
  };

  const handleContinue = () => {
    if (currentQuestion === 1) {
      saveResponse("identity_type", identityType);
      if (identityType === "other") {
        saveResponse("custom_identity", customIdentity);
      }
    } else if (currentQuestion === 2) {
      saveResponse("challenges", challenges);
    } else if (currentQuestion === 3) {
      saveResponse("mental_bandwidth", mentalBandwidth);
    } else if (currentQuestion === 4) {
      saveResponse("scenario_frequency", scenarioFrequency);
      navigate("/onboarding/behavioral");
      return;
    }

    setCurrentQuestion(currentQuestion + 1);
  };

  const canContinue = () => {
    if (currentQuestion === 1) return identityType !== "" && (identityType !== "other" || customIdentity.trim() !== "");
    if (currentQuestion === 2) return challenges.length > 0;
    if (currentQuestion === 3) return mentalBandwidth.length > 0;
    return true;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {currentQuestion === 1 && (
        <QuestionCard title="What best describes you?">
          <div className="space-y-3">
            {identityOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setIdentityType(option.value)}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left flex items-center gap-3 ${
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
          title="Which of these challenges or focus areas do you face most often?"
          subtitle="Select as many as apply"
        >
          <div className="space-y-2">
            {getChallengesForIdentity().map(challenge => (
              <label
                key={challenge}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-card cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={challenges.includes(challenge)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setChallenges([...challenges, challenge]);
                    } else {
                      setChallenges(challenges.filter(c => c !== challenge));
                    }
                  }}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-sm">{challenge}</span>
              </label>
            ))}
          </div>
        </QuestionCard>
      )}

      {currentQuestion === 3 && (
        <QuestionCard 
          title="What's demanding most of your mental bandwidth right now?"
          subtitle="Select as many as apply"
        >
          <div className="space-y-2">
            {getMentalBandwidthOptions().map(option => (
              <label
                key={option}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-card cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={mentalBandwidth.includes(option)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMentalBandwidth([...mentalBandwidth, option]);
                    } else {
                      setMentalBandwidth(mentalBandwidth.filter(m => m !== option));
                    }
                  }}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-sm">{option}</span>
              </label>
            ))}
          </div>
        </QuestionCard>
      )}

      {currentQuestion === 4 && (
        <QuestionCard 
          title="How often do you face situations where you need to..."
          subtitle="Move the sliders to indicate frequency"
        >
          <div className="space-y-6">
            {[
              { key: "think_on_feet", label: "Think on your feet" },
              { key: "difficult_conversations", label: "Navigate difficult conversations" },
              { key: "incomplete_information", label: "Make decisions with incomplete information" },
              { key: "regulate_stress", label: "Regulate stress in real-time" },
            ].map(scenario => (
              <div key={scenario.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{scenario.label}</label>
                  <span className="text-sm text-muted-foreground">
                    {["Rarely", "Occasionally", "Weekly", "Few times/week", "Daily"][
                      scenarioFrequency[scenario.key as keyof typeof scenarioFrequency] - 1
                    ]}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={scenarioFrequency[scenario.key as keyof typeof scenarioFrequency]}
                  onChange={(e) =>
                    setScenarioFrequency({
                      ...scenarioFrequency,
                      [scenario.key]: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-gold"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gold/5 border border-gold/20 rounded-lg">
            <p className="text-xs text-foreground/80 italic leading-relaxed">
              <strong>Insight:</strong> High-frequency pressure creates the strongest case for systematic state management and Meta Cognitive Skill development. Elite performers don't "tough it out"—they deploy precision protocols.
            </p>
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
