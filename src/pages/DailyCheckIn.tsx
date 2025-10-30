
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TopNavigation from "@/components/simulation/TopNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Waves, Target, Home } from "lucide-react";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import TouchOptimized from "@/components/TouchOptimized";
import { getAllResponses } from "@/utils/onboardingStorage";

type Outcome = "pause" | "power-up" | "presence";

interface CheckInData {
  outcome: Outcome;
  context?: string;
  intensity?: "low" | "moderate" | "high";
  timestamp: string;
  date: string;
  skipped: boolean;
  completedFull: boolean;
}

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<"outcome" | "context">("outcome");
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [selectedContext, setSelectedContext] = useState<string>("");

  const outcomes = [
    {
      value: "power-up" as Outcome,
      icon: Zap,
      emoji: "⚡",
      title: "I need energy",
      subtitle: "Power Up",
      description: "Activate & Energize",
      gradient: "from-orange-500/10 to-red-500/10",
      borderColor: "border-orange-500/30 hover:border-orange-500/60",
      bgHover: "hover:bg-orange-500/5"
    },
    {
      value: "pause" as Outcome,
      icon: Waves,
      emoji: "🌊",
      title: "I need calm",
      subtitle: "Pause",
      description: "Reset & Restore",
      gradient: "from-blue-500/10 to-indigo-500/10",
      borderColor: "border-blue-500/30 hover:border-blue-500/60",
      bgHover: "hover:bg-blue-500/5"
    },
    {
      value: "presence" as Outcome,
      icon: Target,
      emoji: "🎯",
      title: "I need focus",
      subtitle: "Presence",
      description: "Deep Focus & Flow",
      gradient: "from-purple-500/10 to-pink-500/10",
      borderColor: "border-purple-500/30 hover:border-purple-500/60",
      bgHover: "hover:bg-purple-500/5"
    }
  ];

  // Get onboarding data for contextual questions
  const onboardingResponses = getAllResponses();
  
  const getContextOptions = (outcome: Outcome) => {
    const pressureResponse = onboardingResponses.q2_pressure_response;
    const setbackResponse = onboardingResponses.q1_setback_response;
    
    const contextMap: Record<Outcome, Array<{label: string; value: string}>> = {
      "pause": [
        { label: "High-stakes decision ahead", value: "high_stakes_decision" },
        { label: "Managing stress & energy", value: "managing_stress" },
        { label: "Just need to reset", value: "quick_reset" }
      ],
      "power-up": [
        { label: "Low energy this morning", value: "low_energy_morning" },
        { label: "Need sustainable energy", value: "sustainable_energy" },
        { label: "Quick boost needed", value: "quick_boost" }
      ],
      "presence": [
        { label: "Big task ahead", value: "big_task_ahead" },
        { label: "Need deep concentration", value: "deep_concentration" },
        { label: "Enter flow state", value: "flow_state" }
      ]
    };
    
    return contextMap[outcome] || [];
  };

  const handleOutcomeSelect = (outcome: Outcome) => {
    setSelectedOutcome(outcome);
    setStage("context");
  };

  const handleSkipContext = () => {
    completeCheckIn(false);
  };

  const handleContextSelect = (context: string) => {
    setSelectedContext(context);
    completeCheckIn(true);
  };

  const completeCheckIn = (withContext: boolean) => {
    if (!selectedOutcome) return;

    const checkInData: CheckInData = {
      outcome: selectedOutcome,
      context: withContext ? selectedContext : undefined,
      intensity: "moderate",
      timestamp: new Date().toISOString(),
      date: new Date().toDateString(),
      skipped: false,
      completedFull: withContext
    };

    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    
    // Navigate to the outcome page
    const routeMap: Record<Outcome, string> = {
      "pause": "/recalibrate/pause",
      "power-up": "/recalibrate/power-up",
      "presence": "/recalibrate/presence"
    };
    
    navigate(routeMap[selectedOutcome]);
  };

  const handleSkipToHome = () => {
    const checkInData: CheckInData = {
      outcome: "pause",
      timestamp: new Date().toISOString(),
      date: new Date().toDateString(),
      skipped: true,
      completedFull: false
    };
    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    navigate('/executive-home');
  };

  // Render outcome selection
  if (stage === "outcome") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <TopNavigation backPath="/executive-home" />
        <SecurityWatermark />
        
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-heading font-bold text-foreground mb-2">
              How are you showing up today?
            </h1>
            <p className="text-muted-foreground font-body">
              Choose what you need right now
            </p>
          </div>

          {/* Outcome Cards */}
          <div className="space-y-4">
            {outcomes.map((outcome) => (
              <TouchOptimized
                key={outcome.value}
                onTap={() => handleOutcomeSelect(outcome.value)}
              >
                <Card 
                  className={`border-2 transition-all duration-300 cursor-pointer ${outcome.borderColor} ${outcome.bgHover} bg-gradient-to-br ${outcome.gradient}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-card border-2 border-border flex items-center justify-center flex-shrink-0">
                        <span className="text-3xl">{outcome.emoji}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-heading font-semibold text-foreground mb-1">
                          {outcome.title}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {outcome.subtitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {outcome.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TouchOptimized>
            ))}
          </div>

          {/* Skip to Home */}
          <Button
            onClick={handleSkipToHome}
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground py-3"
          >
            <Home size={16} className="mr-2" />
            I'm good, take me home
          </Button>
        </div>
      </div>
    );
  }

  // Render context selection
  const selectedOutcomeData = outcomes.find(o => o.value === selectedOutcome);
  const contextOptions = selectedOutcome ? getContextOptions(selectedOutcome) : [];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <TopNavigation backPath="/daily-check-in" />
      <SecurityWatermark />
      
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Header with selected outcome */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-card border-2 border-border flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">{selectedOutcomeData?.emoji}</span>
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            Quick context <span className="text-muted-foreground font-normal">(optional)</span>
          </h2>
          <p className="text-sm text-muted-foreground font-body">
            Is this related to...
          </p>
        </div>

        {/* Context Options */}
        <div className="space-y-3">
          {contextOptions.map((option) => (
            <TouchOptimized
              key={option.value}
              onTap={() => handleContextSelect(option.value)}
            >
              <Card 
                className={`border-2 transition-all duration-300 cursor-pointer hover:border-primary/60 hover:bg-primary/5 ${
                  selectedContext === option.value ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <CardContent className="p-4">
                  <p className="text-sm font-body text-foreground">
                    {option.label}
                  </p>
                </CardContent>
              </Card>
            </TouchOptimized>
          ))}
        </div>

        {/* Continue Button */}
        <Button
          onClick={handleSkipContext}
          variant="outline"
          className="w-full py-3 text-base font-medium"
        >
          Skip this question →
        </Button>
      </div>
    </div>
  );
};

export default DailyCheckIn;
