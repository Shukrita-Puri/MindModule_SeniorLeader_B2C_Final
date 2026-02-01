import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar, Watch } from "lucide-react";
import { getSession } from "@/utils/onboardingStorage";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [calendarPreference, setCalendarPreference] = useState(false);
  const [watchPreference, setWatchPreference] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const savedCalendar = localStorage.getItem('onboarding_calendar_preference');
    const savedWatch = localStorage.getItem('onboarding_watch_preference');
    
    if (savedCalendar) setCalendarPreference(JSON.parse(savedCalendar));
    if (savedWatch) setWatchPreference(JSON.parse(savedWatch));
  }, []);

  const handleToggleCalendar = (checked: boolean) => {
    setCalendarPreference(checked);
    localStorage.setItem('onboarding_calendar_preference', JSON.stringify(checked));
  };

  const handleToggleWatch = (checked: boolean) => {
    setWatchPreference(checked);
    localStorage.setItem('onboarding_watch_preference', JSON.stringify(checked));
  };

  const handleComplete = () => {
    const contextData = {
      calendar: {
        enabled: calendarPreference,
        provider: calendarPreference ? 'google' : null,
        setupCompletedAt: null, // Will be set after actual OAuth connection
        skipped: !calendarPreference
      },
      watch: {
        enabled: watchPreference,
        provider: watchPreference ? 'apple' : null,
        skipped: !watchPreference
      },
      onboardingCompletedAt: new Date().toISOString(),
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
        
        {/* Header - minimal */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Context
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalise your experience
          </p>
        </div>

        {/* Integration Toggles - clean rows */}
        <div className="space-y-3">
          
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Google Calendar</span>
            </div>
            <Switch 
              checked={calendarPreference} 
              onCheckedChange={handleToggleCalendar}
            />
          </div>
          
          {/* Apple Watch */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Watch className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Apple Watch</span>
            </div>
            <Switch 
              checked={watchPreference} 
              onCheckedChange={handleToggleWatch}
            />
          </div>
          
        </div>

        {/* Coming soon note */}
        <p className="text-center text-xs text-muted-foreground/70">
          More calendars, wearables & email integrations coming soon
        </p>

        {/* Info about when connections happen */}
        {(calendarPreference || watchPreference) && (
          <p className="text-center text-xs text-muted-foreground">
            You'll be prompted to connect after signing in
          </p>
        )}

        {/* CTAs */}
        <div className="space-y-3">
          <Button onClick={handleComplete} className="w-full">
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
