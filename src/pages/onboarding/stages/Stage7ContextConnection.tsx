import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar, Watch } from "lucide-react";
import { getSession } from "@/utils/onboardingStorage";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const saved = localStorage.getItem('contextConnectionPreferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      setCalendarEnabled(prefs.calendar || false);
      setWatchEnabled(prefs.watch || false);
    }
  }, []);

  // Handle Google Calendar toggle
  const handleCalendarToggle = async (checked: boolean) => {
    setCalendarEnabled(checked);
    
    // Save preference
    const prefs = { calendar: checked, watch: watchEnabled };
    localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
    
    // If enabling and authenticated, trigger OAuth
    if (checked && isAuthenticated) {
      setLoading(true);
      try {
        const token = await getAccessTokenSilently();
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { action: 'connect', provider: 'google' },
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (error) throw error;
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      } catch (error) {
        console.error('Error connecting calendar:', error);
        toast.error('Failed to connect calendar');
        setCalendarEnabled(false);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle Apple Watch toggle (preference only - native integration coming)
  const handleWatchToggle = (checked: boolean) => {
    setWatchEnabled(checked);
    
    // Save preference
    const prefs = { calendar: calendarEnabled, watch: checked };
    localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
    
    if (checked) {
      toast.info('Apple Watch will connect when you install the mobile app');
    }
  };

  const handleComplete = () => {
    const contextData = {
      onboardingCompletedAt: new Date().toISOString(),
      calendarEnabled,
      watchEnabled,
      plan: 'super-pro'
    };
    
    localStorage.setItem('contextConnections', JSON.stringify(contextData));
    
    const session = getSession();
    if (session) {
      session.responses.onboardingCompleted = true;
      session.responses.completedAt = new Date().toISOString();
      localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
    }
    
    console.log('[Stage7] Context preferences saved, navigating to daily check-in');
    navigate("/daily-check-in");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Context
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalise your experience
          </p>
        </div>

        {/* Integration Options with Toggles */}
        <div className="space-y-3">
          
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Google Calendar</span>
                <span className="text-xs text-muted-foreground">
                  Sync your schedule
                </span>
              </div>
            </div>
            <Switch 
              checked={calendarEnabled}
              onCheckedChange={handleCalendarToggle}
              disabled={loading}
            />
          </div>
          
          {/* Apple Watch */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Watch className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Apple Watch</span>
                <span className="text-xs text-muted-foreground">
                  Available in mobile app
                </span>
              </div>
            </div>
            <Switch 
              checked={watchEnabled}
              onCheckedChange={handleWatchToggle}
            />
          </div>
          
        </div>

        {/* Coming soon note */}
        <p className="text-center text-xs text-muted-foreground/70">
          More calendars, wearables & email integrations coming soon
        </p>

        {/* CTAs */}
        <div className="space-y-3">
          <Button onClick={handleComplete} className="w-full" disabled={loading}>
            Continue
          </Button>
          <button 
            onClick={handleComplete} 
            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>

        {/* Subtle footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          You can change this anytime in settings
        </p>

      </div>
    </div>
  );
}
