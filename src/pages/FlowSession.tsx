import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, RotateCcw, Volume2, VolumeX, Timer, Brain, Target } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MainNavigation from "@/components/MainNavigation";
import BreathingAnimation from "@/components/BreathingAnimation";
import vibrantFocusIllustration from "@/assets/ink-focus-illustration.png";

interface FlowSessionConfig {
  duration: number; // in minutes
  technique: string;
  backgroundSound: string;
  description: string;
}

const FlowSession = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const stepParam = searchParams.get('step');
  const currentStep = parseInt(stepParam || '1');
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0); // in seconds
  const [selectedConfig, setSelectedConfig] = useState<FlowSessionConfig | null>(null);
  const [showBreathing, setShowBreathing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Determine session phase based on URL step
  const getSessionPhase = (): 'setup' | 'breathing' | 'active' | 'complete' => {
    if (currentStep === 1) return 'setup';
    if (currentStep === 2) return 'breathing';
    if (currentStep === 3) return 'active';
    if (currentStep === 4) return 'complete';
    return 'setup';
  };
  
  const [sessionPhase, setSessionPhase] = useState<'setup' | 'breathing' | 'active' | 'complete'>(getSessionPhase());

  const flowConfigs: FlowSessionConfig[] = [
    {
      duration: 25,
      technique: "Pomodoro Focus",
      backgroundSound: "White Noise",
      description: "Classic 25-minute deep work session with gentle white noise"
    },
    {
      duration: 45,
      technique: "Deep Flow",
      backgroundSound: "Nature Sounds",
      description: "Extended focus session with calming nature ambience"
    },
    {
      duration: 90,
      technique: "Flow State",
      backgroundSound: "Binaural Beats",
      description: "Ultimate flow session with brain-enhancing frequencies"
    },
    {
      duration: 15,
      technique: "Quick Focus",
      backgroundSound: "Silence",
      description: "Short burst of concentrated focus for busy schedules"
    }
  ];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startSession = (config: FlowSessionConfig) => {
    setSelectedConfig(config);
    setSearchParams({ step: '2' });
    setSessionPhase('breathing');
    setShowBreathing(true);
  };

  const beginFlowSession = () => {
    if (selectedConfig) {
      setTimeRemaining(selectedConfig.duration * 60);
      setSearchParams({ step: '3' });
      setSessionPhase('active');
      setIsActive(true);
      setShowBreathing(false);
    }
  };

  const toggleSession = () => {
    if (isActive) {
      setIsPaused(!isPaused);
    }
  };

  const resetSession = () => {
    setIsActive(false);
    setIsPaused(false);
    setTimeRemaining(0);
    setSelectedConfig(null);
    setSearchParams({ step: '1' });
    setSessionPhase('setup');
    setShowBreathing(false);
  };

  const endSession = () => {
    setSearchParams({ step: '4' });
    setSessionPhase('complete');
    setIsActive(false);
    
    // Auto-navigate to insights after 3 seconds
    setTimeout(() => {
      navigate('/flow-insights', { 
        state: { 
          technique: selectedConfig?.technique,
          duration: selectedConfig?.duration,
          completed: timeRemaining === 0
        } 
      });
    }, 3000);
  };

  // Sync sessionPhase with URL changes
  useEffect(() => {
    const newPhase = getSessionPhase();
    if (newPhase !== sessionPhase) {
      setSessionPhase(newPhase);
    }
  }, [currentStep, sessionPhase]);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && !isPaused && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((time) => {
          if (time <= 1) {
            endSession();
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isActive, isPaused, timeRemaining]);

  // Breathing preparation phase
  if (sessionPhase === 'breathing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10 flex flex-col font-editorial">
        {/* Minimal Header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-30">
          <button
            onClick={() => {
              if (currentStep === 1) {
                navigate('/flow-state-lab');
              } else {
                setSearchParams({ step: (currentStep - 1).toString() });
                setSessionPhase(getSessionPhase());
              }
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-muted transition-colors"
          >
            {isMuted ? <VolumeX size={18} className="text-foreground" /> : <Volume2 size={18} className="text-foreground" />}
          </button>
        </div>

        {/* Breathing Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="text-center mb-12 max-w-md">
            <h2 className="text-2xl font-heading font-medium text-foreground mb-4">
              Prepare Your Mind
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Take three deep breaths to center yourself before your {selectedConfig?.technique} session
            </p>
          </div>

          <BreathingAnimation />

          <div className="mt-12 text-center">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
              {selectedConfig?.technique} • {selectedConfig?.duration} min
            </Badge>
            
            <Button 
              onClick={beginFlowSession}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
            >
              Begin Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active session phase
  if (sessionPhase === 'active') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/5 flex flex-col font-editorial">
        {/* Minimal Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-30">
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
            {selectedConfig?.technique}
          </Badge>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-background/60 backdrop-blur-sm hover:bg-muted/80 transition-colors"
          >
            {isMuted ? <VolumeX size={14} className="text-foreground" /> : <Volume2 size={14} className="text-foreground" />}
          </button>
        </div>

        {/* Focus Display */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center mb-8">
            <div className="text-6xl font-mono font-light text-foreground mb-4 tracking-wide">
              {formatTime(timeRemaining)}
            </div>
            <div className="w-48 h-1 bg-muted rounded-full mb-6">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
                style={{ 
                  width: selectedConfig 
                    ? `${((selectedConfig.duration * 60 - timeRemaining) / (selectedConfig.duration * 60)) * 100}%` 
                    : '0%' 
                }}
              />
            </div>
            <p className="text-muted-foreground text-sm">
              Deep focus • {selectedConfig?.backgroundSound}
            </p>
          </div>

          {/* Session Controls */}
          <div className="flex items-center gap-4">
            <Button
              onClick={toggleSession}
              variant="outline"
              size="sm"
              className="w-12 h-12 rounded-full border-primary/20 hover:bg-primary/10"
            >
              {isPaused ? <Play size={16} className="text-primary" /> : <Pause size={16} className="text-primary" />}
            </Button>
            
            <Button
              onClick={resetSession}
              variant="outline"
              size="sm"
              className="w-12 h-12 rounded-full border-muted hover:bg-muted"
            >
              <RotateCcw size={16} className="text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Subtle Flow State Indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>Flow State Active</span>
          </div>
        </div>
      </div>
    );
  }

  // Session complete phase
  if (sessionPhase === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center font-editorial px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Brain size={32} className="text-primary" />
          </div>
          
          <h2 className="text-3xl font-heading font-medium text-foreground mb-4">
            Session Complete
          </h2>
          
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Great work! You completed your {selectedConfig?.technique} session. 
            Processing your flow insights...
          </p>
          
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex space-x-1">
              <div className="w-1 h-1 bg-primary rounded-full animate-pulse"></div>
              <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <span>Generating insights...</span>
          </div>
        </div>
      </div>
    );
  }

  // Setup phase (default)
  return (
    <div className="min-h-screen bg-background font-editorial pb-20">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/flow-state-lab")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Flow Session
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section */}
      <div className="px-8 py-12 text-center max-w-2xl mx-auto">
        <div className="w-32 h-32 mx-auto mb-8 rounded-full overflow-hidden shadow-lg border-4 border-primary/10">
          <img 
            src={vibrantFocusIllustration} 
            alt="Flow state focus"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-6 leading-tight">
          Enter Flow State
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-12">
          Choose your focus technique and duration for deep, uninterrupted work.
        </p>
      </div>

      {/* Flow Session Options */}
      <div className="px-6 max-w-2xl mx-auto space-y-4">
        {flowConfigs.map((config, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => startSession(config)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {config.duration <= 25 ? <Timer size={16} className="text-primary" /> : 
                     config.duration <= 45 ? <Target size={16} className="text-primary" /> : 
                     <Brain size={16} className="text-primary" />}
                  </div>
                  <div>
                    <h3 className="font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                      {config.technique}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {config.duration} minutes • {config.backgroundSound}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {config.duration}m
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground leading-relaxed">
                {config.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tips Section */}
      <div className="px-6 max-w-2xl mx-auto mt-12">
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-6">
            <h3 className="font-heading font-medium text-foreground mb-3">
              Flow Session Tips
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Find a quiet, distraction-free environment</li>
              <li>• Keep water and any needed materials nearby</li>
              <li>• Turn off notifications on your devices</li>
              <li>• Start with breathing to center your mind</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <MainNavigation />
    </div>
  );
};

export default FlowSession;