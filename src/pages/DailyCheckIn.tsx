
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Fetch user plan tier
  const { data: profile } = useQuery({
    queryKey: ['profile-plan', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('plan_tier')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id
  });
  
  // Fetch connection status for tier inference
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
  
  const planTier = profile?.plan_tier || (connections?.hasWearable || connections?.hasCalendar ? 'super_pro' : 'pro');

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
      "calm": "calm",      // anxious/tense → anxious (45 balance)
      "ready": "ready"     // motivated/ready → balanced (85 balance)
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
    
    navigate('/executive-home');
  };

  const handleSkipToHome = async () => {
    // Track skip event for analytics
    if (user?.id) {
      await supabase.from('checkin_skip_events').insert({
        user_id: user.id,
        skip_date: new Date().toISOString().split('T')[0],
        plan_tier: planTier,
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
    if (planTier === 'super_pro') {
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
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <IconComponent className="w-6 h-6 text-primary" />
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

        {/* Skip to Home - Dynamic text based on plan tier */}
        <Button
          variant="outline"
          onClick={handleSkipToHome}
          className="w-full py-3"
        >
          <Home size={16} className="mr-2" />
          {getSkipButtonText()}
        </Button>
      </div>
      
      <MainNavigation />
    </div>
  );
};

export default DailyCheckIn;
