import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Watch } from "lucide-react";
import { getSession } from "@/utils/onboardingStorage";
import { useAuth } from "@/hooks/useAuth";
import CalendarConnectionSettings from "@/components/CalendarConnectionSettings";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleComplete = () => {
    const contextData = {
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

        {/* Integration Options */}
        <div className="space-y-3">
          
          {/* Google Calendar - Real OAuth */}
          {isAuthenticated ? (
            <CalendarConnectionSettings compact />
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-card border opacity-60">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Sign in to connect calendar
                </span>
              </div>
            </div>
          )}
          
          {/* Apple Watch - Coming Soon */}
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
            <Badge variant="outline" className="text-xs">
              Coming Soon
            </Badge>
          </div>
          
        </div>

        {/* Coming soon note */}
        <p className="text-center text-xs text-muted-foreground/70">
          More calendars, wearables & email integrations coming soon
        </p>

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
