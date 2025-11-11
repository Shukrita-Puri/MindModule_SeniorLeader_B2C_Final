
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Waves, Target, Home, Sparkles } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import architecturalPresence from "@/assets/architectural-presence.jpg";
import { trackEngagement } from "@/utils/engagementTracking";

type Outcome = "pause" | "power-up" | "presence" | "calm" | "ready";

interface CheckInData {
  outcome: Outcome;
  displayOutcome?: Outcome;
  timestamp: string;
  date: string;
  skipped: boolean;
  completedFull: boolean;
  // Future memory fields (not collected yet):
  context?: string;
  preferredSoundscape?: string;
  preferredPractice?: string;
  usageHistory?: Array<{
    sessionType: string;
    timestamp: string;
    completed: boolean;
  }>;
}

const DailyCheckIn = () => {
  const navigate = useNavigate();

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
    },
    {
      value: "ready" as Outcome,
      icon: Sparkles,
      title: "I am motivated and ready",
      borderColor: "border-primary hover:border-primary"
    }
  ];

  const handleOutcomeSelect = (outcome: Outcome) => {
    // Track check-in engagement
    trackEngagement('check_in');
    
    // Map UI outcomes to stored outcomes per user's request
    const outcomeMap: Record<Outcome, Outcome> = {
      "pause": "pause",
      "power-up": "power-up", 
      "presence": "presence",
      "calm": "pause",      // anxious/tense maps to pause
      "ready": "presence"   // motivated/ready maps to presence
    };
    
    const mappedOutcome = outcomeMap[outcome];
    
    const checkInData: CheckInData = {
      outcome: mappedOutcome,
      displayOutcome: outcome, // Store original selection for UI display
      timestamp: new Date().toISOString(),
      date: new Date().toDateString(),
      skipped: false,
      completedFull: true,
      usageHistory: [] // For future memory tracking
    };

    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    navigate('/executive-home');
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-20 pb-32 relative overflow-hidden">
      {/* Background Image with Warm Taupe Overlay */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url('${architecturalPresence}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-taupe/60 via-taupe/50 to-cream/40 img-taupe-overlay" />
      </div>

      <TopNavigation backPath="/executive-home" />
      
      <div className="w-full max-w-md space-y-6 animate-fade-in relative z-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2 drop-shadow-md">
            How are you feeling right now?
          </h1>
          <p className="text-foreground/80 font-body drop-shadow">
            Be honest with yourself
          </p>
        </div>

        {/* Outcome Cards - Glass-morphism */}
        <div className="space-y-3">
          {outcomes.map((outcome) => {
            const IconComponent = outcome.icon;
            return (
              <TouchOptimized
                key={outcome.value}
                onTap={() => handleOutcomeSelect(outcome.value)}
              >
                <Card 
                  className="bg-white/40 backdrop-blur-xl border border-taupe/20 transition-all duration-300 cursor-pointer hover:bg-white/60 hover:border-taupe/40 hover:shadow-lg"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/50 backdrop-blur-md border border-taupe/30 flex items-center justify-center flex-shrink-0">
                        <IconComponent className="w-6 h-6 text-taupe" />
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

        {/* Skip to Home - Translucent taupe button */}
        <Button
          onClick={handleSkipToHome}
          className="w-full bg-white/30 backdrop-blur-xl border border-taupe/30 hover:bg-white/50 text-foreground py-3 taupe-gradient-shine"
        >
          <Home size={16} className="mr-2" />
          I am good, take me to my Mind Atelier
        </Button>
      </div>
      
      <MainNavigation />
    </div>
  );
};

export default DailyCheckIn;
