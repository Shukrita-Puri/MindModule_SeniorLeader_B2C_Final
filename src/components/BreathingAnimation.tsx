
import { useState, useEffect } from "react";

const BreathingAnimation = () => {
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold1" | "exhale" | "hold2">("inhale");
  const [phaseTime, setPhaseTime] = useState(0);

  // Box breathing pattern: 4 seconds inhale, 4 seconds hold, 4 seconds exhale, 4 seconds hold
  const breathingPattern = {
    inhale: 4,
    hold1: 4,
    exhale: 4,
    hold2: 4
  };

  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseTime((prev) => {
        const currentPhaseDuration = breathingPattern[breathPhase];
        
        if (prev >= currentPhaseDuration) {
          // Move to next phase in box breathing cycle
          if (breathPhase === "inhale") {
            setBreathPhase("hold1");
          } else if (breathPhase === "hold1") {
            setBreathPhase("exhale");
          } else if (breathPhase === "exhale") {
            setBreathPhase("hold2");
          } else {
            setBreathPhase("inhale");
          }
          return 0;
        }
        return prev + 0.1;
      });
    }, 100);

    return () => clearInterval(phaseTimer);
  }, [breathPhase]);

  const getCircleScale = () => {
    const progress = phaseTime / breathingPattern[breathPhase];
    
    if (breathPhase === "inhale") {
      return 0.6 + (0.4 * progress); // Scale from 0.6 to 1.0
    } else if (breathPhase === "hold1") {
      return 1.0; // Stay at full size during first hold
    } else if (breathPhase === "exhale") {
      return 1.0 - (0.4 * progress); // Scale from 1.0 to 0.6
    } else { // hold2
      return 0.6; // Stay at minimum size during second hold
    }
  };

  const getInstructions = () => {
    switch (breathPhase) {
      case "inhale":
        return "Breathe in slowly...";
      case "hold1":
        return "Hold your breath...";
      case "exhale":
        return "Breathe out slowly...";
      case "hold2":
        return "Hold empty...";
    }
  };

  return (
    <div className="text-center space-y-8">
      {/* Breathing Circle */}
      <div className="relative">
        <div 
          className="w-48 h-48 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg transition-transform duration-100 ease-in-out flex items-center justify-center"
          style={{ transform: `scale(${getCircleScale()})` }}
        >
          <div className="w-32 h-32 rounded-full bg-white/30 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/50 flex items-center justify-center">
              <div className="text-white text-2xl">🫁</div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div>
        <h3 className="text-2xl font-bold text-gray-800 mb-2">Breathe with Me</h3>
        <p className="text-xl text-gray-600 mb-2">{getInstructions()}</p>
        <div className="text-sm text-gray-500 capitalize">
          {breathPhase} phase
        </div>
      </div>

      {/* Animated Avatar */}
      <div className="flex items-center justify-center">
        <div 
          className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center transition-transform duration-100"
          style={{ transform: `scale(${getCircleScale()})` }}
        >
          <span className="text-white text-2xl">😌</span>
        </div>
      </div>
    </div>
  );
};

export default BreathingAnimation;
