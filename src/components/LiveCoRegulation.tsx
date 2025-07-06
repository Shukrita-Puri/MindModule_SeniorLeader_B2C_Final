
import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface LiveCoRegulationProps {
  mode: "breathing" | "talking";
  onComplete?: () => void;
}

const LiveCoRegulation = ({ mode, onComplete }: LiveCoRegulationProps) => {
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [phaseTime, setPhaseTime] = useState(0);
  const [talkingPhase, setTalkingPhase] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const breathingPattern = {
    inhale: 4,
    hold: 2,
    exhale: 6
  };

  const calmingPhrases = [
    "I'm here with you. You're safe.",
    "Let's breathe together slowly.",
    "This feeling will pass. You're strong.",
    "Focus on my voice. You're not alone.",
    "One breath at a time. You're doing great.",
    "Feel your feet on the ground. You're present.",
    "This storm will pass. You're resilient."
  ];

  useEffect(() => {
    if (mode === "breathing") {
      const phaseTimer = setInterval(() => {
        setPhaseTime((prev) => {
          const currentPhaseDuration = breathingPattern[breathPhase];
          
          if (prev >= currentPhaseDuration) {
            if (breathPhase === "inhale") {
              setBreathPhase("hold");
            } else if (breathPhase === "hold") {
              setBreathPhase("exhale");
            } else {
              setBreathPhase("inhale");
            }
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);

      return () => clearInterval(phaseTimer);
    } else if (mode === "talking") {
      const talkingTimer = setInterval(() => {
        setTalkingPhase((prev) => (prev + 1) % calmingPhrases.length);
      }, 5000);

      return () => clearInterval(talkingTimer);
    }
  }, [breathPhase, mode]);

  const getAvatarScale = () => {
    if (mode === "breathing") {
      const progress = phaseTime / breathingPattern[breathPhase];
      
      if (breathPhase === "inhale") {
        return 1.0 + (0.3 * progress);
      } else if (breathPhase === "hold") {
        return 1.3;
      } else {
        return 1.3 - (0.3 * progress);
      }
    }
    return 1.0 + 0.1 * Math.sin(Date.now() / 1000);
  };

  const getInstructions = () => {
    if (mode === "breathing") {
      switch (breathPhase) {
        case "inhale":
          return "Breathe in with me...";
        case "hold":
          return "Hold gently...";
        case "exhale":
          return "Breathe out slowly...";
      }
    }
    return calmingPhrases[talkingPhase];
  };

  return (
    <div className="text-center space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">
          {mode === "breathing" ? "Breathing Together" : "Calming Support"}
        </h3>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* Animated Avatar */}
      <div className="relative flex justify-center">
        <div 
          className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 shadow-xl transition-transform duration-300 ease-in-out flex items-center justify-center"
          style={{ transform: `scale(${getAvatarScale()})` }}
        >
          <div className="w-24 h-24 rounded-full bg-white/30 flex items-center justify-center">
            <span className="text-4xl">
              {mode === "breathing" ? "🫁" : "💙"}
            </span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <p className="text-lg text-gray-700 font-medium">
          {getInstructions()}
        </p>
        {mode === "breathing" && (
          <div className="text-sm text-gray-500 capitalize">
            {breathPhase} phase
          </div>
        )}
      </div>

      {mode === "talking" && (
        <div className="text-xs text-gray-400">
          Phrase {talkingPhase + 1} of {calmingPhrases.length}
        </div>
      )}
    </div>
  );
};

export default LiveCoRegulation;
