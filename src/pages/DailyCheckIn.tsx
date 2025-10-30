
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Waves, Target, Home } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import { getAllResponses } from "@/utils/onboardingStorage";

type Outcome = "pause" | "power-up" | "presence" | "calm";

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
      value: "pause" as Outcome,
      icon: Waves,
      title: "I'm stressed or overwhelmed",
      borderColor: "border-accent hover:border-accent"
    },
    {
      value: "power-up" as Outcome,
      icon: Zap,
      title: "I'm drained or tired",
      borderColor: "border-primary hover:border-primary"
    },
    {
      value: "presence" as Outcome,
      icon: Target,
      title: "I'm scattered or unfocused",
      borderColor: "border-gold hover:border-gold"
    },
    {
      value: "calm" as Outcome,
      icon: Waves,
      title: "I'm anxious or tense",
      borderColor: "border-muted hover:border-muted"
    }
  ];

  // Get onboarding data for contextual questions
  const onboardingResponses = getAllResponses();
  
  const getContextOptions = (outcome: Outcome) => {
    const hasCalendar = onboardingResponses?.calendarAccess === true;
    const hasWearables = onboardingResponses?.wearablesAccess === true;
    
    const contextMap: Record<Outcome, Array<{label: string; value: string}>> = {
      "pause": [
        ...(hasCalendar ? [{ label: "My calendar looks packed today", value: "calendar_heavy" }] : []),
        { label: "I have something important coming up", value: "big_event" },
        { label: "I have too much on my plate", value: "too_much" },
        { label: "I'm feeling pressure to perform", value: "pressure" }
      ],
      "power-up": [
        ...(hasWearables ? [{ label: "I didn't sleep well", value: "sleep_poor" }] : []),
        { label: "I'm starting my day", value: "morning" },
        { label: "I hit an energy dip", value: "afternoon_slump" },
        { label: "I've been pushing too hard", value: "burnout" }
      ],
      "presence": [
        { label: "I have too many things pulling my attention", value: "distracted" },
        { label: "I'm avoiding something I need to do", value: "procrastinating" },
        { label: "I'm not sure where to start", value: "unclear" }
      ],
      "calm": [
        ...(hasWearables ? [{ label: "My body feels on edge", value: "elevated_hr" }] : []),
        { label: "I can't stop worrying", value: "worry" },
        { label: "I feel physically tense", value: "restless" },
        { label: "I'm facing uncertainty", value: "uncertainty" }
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
      "pause": "/recalibrate/emergency-reset",
      "power-up": "/recalibrate/power-up",
      "presence": "/recalibrate/flow-state",
      "calm": "/recalibrate/breathwork"
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
      <div className="min-h-screen flex items-center justify-center p-4 pb-32">
        <TopNavigation backPath="/executive-home" />
        
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-heading font-bold text-foreground mb-2">
              How are you feeling right now?
            </h1>
            <p className="text-muted-foreground font-body">
              Be honest with yourself
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
            I am good, take me to my Mind Atelier
          </Button>
        </div>
        
        <MainNavigation />
      </div>
    );
  }

  // Render context selection
  const selectedOutcomeData = outcomes.find(o => o.value === selectedOutcome);
  const contextOptions = selectedOutcome ? getContextOptions(selectedOutcome) : [];
  const SelectedIcon = selectedOutcomeData?.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pb-32">
      <TopNavigation backPath="/daily-check-in" />
      
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Header with selected outcome */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-background border-2 border-border flex items-center justify-center mx-auto mb-4">
            {SelectedIcon && <SelectedIcon className="w-10 h-10 text-foreground" />}
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            Tell me more...
          </h2>
          <p className="text-sm text-muted-foreground font-body">
            What's going on for you?
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
      
      <MainNavigation />
    </div>
  );
};

export default DailyCheckIn;
