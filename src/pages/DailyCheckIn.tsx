
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Waves, Target, Home, Sparkles } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import architecturalPresence from "@/assets/architectural-presence.jpg";
import { trackEngagement } from "@/utils/engagementTracking";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Outcome = "pause" | "power-up" | "presence" | "steady" | "focused" | "ready";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  
  // Check if user has active subscription
  const hasActiveSubscription = user?.subscription_status === 'active';
  
  // Check if this is user's first check-in (completing onboarding)
  const isFirstCheckIn = !localStorage.getItem('dailyCheckIn');
  
  // Fetch connection status
  const { data: connections } = useQuery({
    queryKey: ['connections', user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasWearable: false, hasCalendar: false };
      const [oura, calendar] = await Promise.all([
        supabase.from('oura_connections').select('id').eq('user_id', user.id).single(),
        supabase.from('calendar_connections').select('id').eq('user_id', user.id).single()
      ]);
      return {
        hasWearable: !!oura.data,
        hasCalendar: !!calendar.data
      };
    },
    enabled: !!user?.id
  });

  const outcomes = [
    // DEPLETED (0-39)
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
    
    // MANAGING (40-59)
    {
      value: "steady" as Outcome,
      icon: Target,
      title: "I'm feeling steady and balanced",
      borderColor: "border-taupe hover:border-taupe"
    },
    {
      value: "presence" as Outcome,
      icon: Target,
      title: "I'm scattered or unfocused",
      borderColor: "border-gold hover:border-gold"
    },
    
    // STRONG/PEAK (60-100)
    {
      value: "focused" as Outcome,
      icon: Sparkles,
      title: "I'm focused and energized",
      borderColor: "border-primary hover:border-primary"
    },
    {
      value: "ready" as Outcome,
      icon: Sparkles,
      title: "I am motivated and ready",
      borderColor: "border-saffron hover:border-saffron"
    }
  ];

  const handleOutcomeSelect = (outcome: Outcome) => {
    // Track check-in engagement
    trackEngagement('check_in');
    
    // Map UI outcomes to stored outcomes
    const outcomeMap: Record<Outcome, Outcome> = {
      "pause": "pause",
      "power-up": "power-up", 
      "presence": "presence",
      "steady": "steady",
      "focused": "focused",
      "ready": "ready"
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

    // Save to localStorage
    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    
    // Debug log to verify save
    console.log('[Check-In] Saved to localStorage:', checkInData);
    console.log('[Check-In] Stored value:', localStorage.getItem('dailyCheckIn'));
    
    // Invalidate energy-state query to force refetch
    queryClient.invalidateQueries({ queryKey: ['energy-state'] });
    
    // For first-time users, show welcome modal instead of auto-redirecting
    if (isFirstCheckIn) {
      setShowWelcomeModal(true);
    } else {
      // Existing users get auto-redirected
      setTimeout(() => {
        navigate('/executive-home');
      }, 100);
    }
  };

  const handleSkipToHome = async () => {
    // Track skip event for analytics
    if (user?.id) {
      await supabase.from('checkin_skip_events').insert({
        user_id: user.id,
        skip_date: new Date().toISOString().split('T')[0],
        has_wearable: connections?.hasWearable || false,
        has_calendar: connections?.hasCalendar || false
      });
    }
    
    // Mark skip in localStorage (don't create fake check-in)
    localStorage.setItem('dailyCheckInSkipped', JSON.stringify({
      skipped: true,
      timestamp: new Date().toISOString(),
      date: new Date().toDateString()
    }));
    
    navigate('/executive-home');
  };
  
  // Dynamic skip button text
  const getSkipButtonText = () => {
    if (hasActiveSubscription) {
      return "Skip check-in (use wearable data)";
    }
    return "I am good, take me to my Mind Atelier";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-20 pb-32 bg-background">
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
                  className="bg-card/80 backdrop-blur-sm border transition-all duration-300 cursor-pointer hover:bg-card hover:shadow-lg"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
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

      </div>
      
      <MainNavigation />
      
      {/* Welcome Modal for First-Time Users */}
      <Dialog open={showWelcomeModal} onOpenChange={setShowWelcomeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading">Welcome to Your Mind Atelier!</DialogTitle>
            <DialogDescription className="text-base space-y-3 pt-2">
              <p>
                Your personalized dashboard is ready. Here you'll find:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Daily rituals tailored to your energy state</li>
                <li>Micro-practices for quick recalibrations</li>
                <li>Insights from your calendar and wearable data</li>
                <li>Progress tracking and mental fitness scores</li>
              </ul>
              <p className="font-medium text-foreground pt-2">
                Let's begin your journey to peak performance.
              </p>
            </DialogDescription>
          </DialogHeader>
          <Button 
            onClick={() => {
              setShowWelcomeModal(false);
              navigate('/executive-home');
            }}
            className="w-full"
            size="lg"
          >
            Continue to My Dashboard
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DailyCheckIn;
