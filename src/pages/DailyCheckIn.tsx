import { useNavigate } from "react-router-dom";
import TopNavigation from "@/components/simulation/TopNavigation";

import { Card, CardContent } from "@/components/ui/card";
import { Zap, Waves, Target, Sparkles, Wind } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import { trackEngagement } from "@/utils/engagementTracking";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveCheckin } from "@/utils/dailyCheckins";
import { getCheckInScore } from "@/utils/energyStateScoring";

// New outcome types mapping to internal axes
type Outcome = "overwhelmed" | "drained" | "steady" | "scattered" | "focused";

interface CheckInData {
  outcome: Outcome;
  timestamp: string;
  date: string;
  skipped: boolean;
  completedFull: boolean;
}

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  
  // Check if user has active subscription
  const hasActiveSubscription = user?.subscription_status === 'active';
  
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

  // 5 clean states without emojis - maps to internal axes
  const outcomes = [
    {
      value: "overwhelmed" as Outcome,
      icon: Waves,
      title: "Overwhelmed / Stressed"
    },
    {
      value: "drained" as Outcome,
      icon: Zap,
      title: "Low energy / Drained"
    },
    {
      value: "steady" as Outcome,
      icon: Target,
      title: "Okay / Steady"
    },
    {
      value: "scattered" as Outcome,
      icon: Wind,
      title: "Scattered / Unfocused"
    },
    {
      value: "focused" as Outcome,
      icon: Sparkles,
      title: "Focused / Energized"
    }
  ];

  const handleOutcomeSelect = async (outcome: Outcome) => {
    // Track check-in engagement
    trackEngagement('check_in');
    
    const timestamp = new Date().toISOString();
    const checkinDate = timestamp.split('T')[0];
    const energyBalance = getCheckInScore(outcome);
    
    const checkInData: CheckInData = {
      outcome,
      timestamp,
      date: new Date().toDateString(),
      skipped: false,
      completedFull: true
    };

    // Save to localStorage for immediate use
    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    
    // Debug log to verify save
    console.log('[Check-In] Saved to localStorage:', checkInData);
    
    // Also save to database for persistence and insights
    try {
      await saveCheckin({
        checkin_date: checkinDate,
        outcome,
        energy_balance: energyBalance,
        skipped: false,
        timestamp,
        data_sources: { check_in: true }
      });
      console.log('[Check-In] Saved to database');
    } catch (error) {
      console.error('[Check-In] Failed to save to database:', error);
      // Continue anyway - localStorage is sufficient for immediate use
    }
    
    // Invalidate energy-state query to force refetch
    queryClient.invalidateQueries({ queryKey: ['energy-state'] });
    
    // Go straight to Today page - no intermediate pages
    setTimeout(() => {
      navigate('/executive-home');
    }, 100);
  };

  const handleSkipToHome = async () => {
    // Track skip event for analytics via edge function
    if (user?.id) {
      try {
        const accessToken = await getAccessTokenSilently();
        await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'LOG_CHECKIN_SKIP',
            skipDate: new Date().toISOString().split('T')[0],
            hasWearable: connections?.hasWearable || false,
            hasCalendar: connections?.hasCalendar || false
          }
        });
      } catch (error) {
        console.error('Failed to log checkin skip:', error);
      }
    }
    
    // Mark skip in localStorage (don't create fake check-in)
    localStorage.setItem('dailyCheckInSkipped', JSON.stringify({
      skipped: true,
      timestamp: new Date().toISOString(),
      date: new Date().toDateString()
    }));
    
    navigate('/executive-home');
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
            Just your first instinct. Don't overthink it.
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
    </div>
  );
};

export default DailyCheckIn;
