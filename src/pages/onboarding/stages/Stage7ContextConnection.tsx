import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Calendar, ArrowRight, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSession } from "@/utils/onboardingStorage";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Check if calendar is actually connected
  useEffect(() => {
    const checkCalendarConnection = async () => {
      try {
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (!user) {
          setCheckingConnection(false);
          return;
        }
        const {
          data,
          error
        } = await supabase.from('calendar_connections').select('*').eq('user_id', user.id).eq('is_active', true).single();
        if (data && !error) {
          setCalendarConnected(true);
        }
      } catch (error) {
        console.error('Error checking calendar connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };
    checkCalendarConnection();

    // Listen for storage events (when connection happens in another component)
    const handleStorageChange = () => {
      checkCalendarConnection();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleToggleCalendar = async (checked: boolean) => {
    if (!checked || calendarConnected) return;
    
    setConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to connect your calendar");
        setConnecting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'connect', provider: 'google' }
      });

      if (error) throw error;

      if (data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error) {
      console.error('Calendar connection error:', error);
      toast.error("Failed to connect calendar. Please try again.");
      setConnecting(false);
    }
  };

  const handleComplete = (skipCalendar = false) => {
    // Save context connection data
    const contextData = {
      calendar: {
        enabled: calendarConnected,
        provider: calendarConnected ? 'google' : null,
        setupCompletedAt: calendarConnected ? new Date().toISOString() : null,
        skipped: skipCalendar
      },
      onboardingCompletedAt: new Date().toISOString(),
      plan: 'super-pro'
    };
    
    localStorage.setItem('contextConnections', JSON.stringify(contextData));
    
    // Mark onboarding as completed in session
    const session = getSession();
    if (session) {
      session.responses.onboardingCompleted = true;
      session.responses.completedAt = new Date().toISOString();
      localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
    }
    
    console.log('[Stage7] Context connection saved, navigating to daily check-in');
    
    // Navigate to daily check-in (first-time completion of onboarding flow)
    navigate("/daily-check-in");
  };

  return <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Connect Your Calendar</h1>
          <p className="text-muted-foreground">
            Make your journey Proactive and Contextualised. Recalibrate for moments of impact.
          </p>
        </div>

        {/* Main Calendar Card */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {connecting ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                ) : (
                  <Calendar className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-lg">Calendar Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Connect Google Calendar for contextual insights
                </p>
              </div>
            </div>
            <Switch 
              checked={calendarConnected} 
              onCheckedChange={handleToggleCalendar}
              disabled={checkingConnection || connecting}
            />
          </div>

          {/* Value Prop Section */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-3">
              Why Our Users Love Integrations
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>3x more consistent practice habit formation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>67% better transfer to real-world situations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Proactive support during high-stress moments</span>
              </li>
            </ul>
          </div>
        </Card>

        {/* Coming Soon Teaser */}
        <Card className="p-4 border-dashed bg-[#fbfbfa]/30">
          <p className="text-sm text-center text-muted-foreground">
            More integrations coming soon
            <span className="block mt-1 text-xs">More Calendar options •Wearables • Voice • Email</span>
          </p>
        </Card>

        {/* Privacy Link */}
        <div className="text-center">
          <a href="https://docs.lovable.dev/features/security" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
            <Lock className="w-3 h-3" />
            How we protect your data
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button onClick={() => handleComplete(false)} className="w-full" disabled={checkingConnection}>
            Continue to App
          </Button>
          <Button variant="ghost" onClick={() => handleComplete(true)} className="w-full text-sm">
            Skip for now
          </Button>
        </div>
      </div>
    </div>;
}