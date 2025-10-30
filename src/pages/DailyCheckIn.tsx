
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
      title: "I need energy",
      borderColor: "border-accent hover:border-accent"
    },
    {
      value: "pause" as Outcome,
      icon: Waves,
      title: "I need calm",
      borderColor: "border-primary hover:border-primary"
    },
    {
      value: "presence" as Outcome,
      icon: Target,
      title: "I need focus",
      borderColor: "border-gold hover:border-gold"
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
          <div className="space-y-3">
            {outcomes.map((outcome) => {
              const IconComponent = outcome.icon;
              return (
                <TouchOptimized
                  key={outcome.value}
                  onTap={() => handleOutcomeSelect(outcome.value)}
                >
                  <Card 
                    className={`border-2 transition-all duration-300 cursor-pointer hover:bg-card/50 ${outcome.borderColor}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-background border border-border flex items-center justify-center flex-shrink-0">
                          <IconComponent className="w-6 h-6 text-foreground" />
                        </div>
                        <h3 className="text-base font-body font-medium text-foreground">
                          {outcome.title}
                        </h3>
                      </div>
                    </CardContent>
                  </Card>
                </TouchOptimized>
              );
            })}
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
  const SelectedIcon = selectedOutcomeData?.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <TopNavigation backPath="/daily-check-in" />
      <SecurityWatermark />
      
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Header with selected outcome */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-background border-2 border-border flex items-center justify-center mx-auto mb-4">
            {SelectedIcon && <SelectedIcon className="w-10 h-10 text-foreground" />}
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
