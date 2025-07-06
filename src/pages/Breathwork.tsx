
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, Volume2, VolumeX } from "lucide-react";
import vibrantBreathworkHero from "@/assets/vibrant-breathwork-hero.png";

const Breathwork = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const targetRoute = location.state?.targetRoute || "/";
  const moduleTitle = location.state?.moduleTitle || "Session";
  
  const [timeLeft, setTimeLeft] = useState(60);
  const [isRunning, setIsRunning] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [phaseTime, setPhaseTime] = useState(0);

  // Breathing pattern: 4 seconds inhale, 2 seconds hold, 6 seconds exhale
  const breathingPattern = {
    inhale: 4,
    hold: 2,
    exhale: 6
  };

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          navigate(targetRoute);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, navigate, targetRoute]);

  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseTime((prev) => {
        const currentPhaseDuration = breathingPattern[breathPhase];
        
        if (prev >= currentPhaseDuration) {
          // Move to next phase
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
  }, [breathPhase]);

  const getCircleScale = () => {
    const progress = phaseTime / breathingPattern[breathPhase];
    
    if (breathPhase === "inhale") {
      return 0.6 + (0.4 * progress); // Scale from 0.6 to 1.0
    } else if (breathPhase === "hold") {
      return 1.0; // Stay at full size
    } else {
      return 1.0 - (0.4 * progress); // Scale from 1.0 to 0.6
    }
  };

  const getInstructions = () => {
    switch (breathPhase) {
      case "inhale":
        return "Breathe in slowly...";
      case "hold":
        return "Hold your breath...";
      case "exhale":
        return "Breathe out slowly...";
    }
  };

  const handleClose = () => {
    navigate(targetRoute);
  };

  const handleSkip = () => {
    navigate(targetRoute);
  };

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-background font-editorial overflow-hidden">
      {/* Hero Visual Background */}
      <div className="absolute inset-0 z-0">
        <img 
          src={vibrantBreathworkHero} 
          alt="Breathwork preparation" 
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background/90" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted transition-colors"
          >
            <X size={18} className="text-foreground" />
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted transition-colors"
          >
            {isMuted ? <VolumeX size={18} className="text-foreground" /> : <Volume2 size={18} className="text-foreground" />}
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="text-center mb-12 max-w-lg bg-background/80 backdrop-blur-sm rounded-2xl p-8 border border-border/50">
            <h1 className="text-3xl font-heading font-medium text-foreground mb-6 leading-tight">
              Preparing for your session
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed font-body mb-8">
              Take a moment to center yourself with this breathing exercise
            </p>
            <div className="text-4xl font-heading font-medium text-foreground">
              {timeLeft}s
            </div>
          </div>

          {/* Breathing Circle */}
          <div className="relative mb-12">
            <div 
              className="w-64 h-64 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-xl transition-transform duration-100 ease-in-out flex items-center justify-center"
              style={{ transform: `scale(${getCircleScale()})` }}
            >
              <div className="w-48 h-48 rounded-full bg-background/30 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-background/50 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-background/70"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center mb-12 bg-background/80 backdrop-blur-sm rounded-xl p-6 border border-border/50">
            <p className="text-xl font-body font-medium text-foreground mb-3">
              {getInstructions()}
            </p>
            <div className="text-sm text-muted-foreground font-body capitalize">
              {breathPhase} phase
            </div>
          </div>

          {/* Skip Button */}
          <button
            onClick={handleSkip}
            className="px-8 py-3 bg-background/80 backdrop-blur-sm hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground font-body transition-colors border border-border/50"
          >
            Skip and Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default Breathwork;
