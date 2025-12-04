import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Calendar, ArrowRight, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSession } from "@/utils/onboardingStorage";
import { useAuth } from "@/hooks/useAuth";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: appUser } = useAuth();
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Handle OAuth popup message
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Check if message is from our OAuth popup
      if (event.data?.type === 'calendar_connected') {
        console.log('[Stage7] Received OAuth popup message:', event.data);
        
        if (event.data.success) {
          toast.success("Calendar connected successfully!");
          setCalendarConnected(true);
          setConnecting(false);
          
          // Trigger initial calendar sync
          try {
            console.log('[Stage7] Triggering initial calendar sync');
            const { error } = await supabase.functions.invoke('sync-calendar', {
              body: { provider: 'google' }
            });
            
            if (error) {
              console.error('[Stage7] Sync error:', error);
              toast.error("Calendar connected but sync failed", {
                description: "You can try syncing again from settings."
              });
            } else {
              console.log('[Stage7] Initial sync completed successfully');
              toast.success("Calendar synced successfully!");
            }
          } catch (error) {
            console.error('[Stage7] Sync failed:', error);
          }
        } else {
          toast.error("Calendar connection failed", {
            description: event.data.error || "Please try again."
          });
          setCalendarConnected(false);
          setConnecting(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Also check URL params for fallback (deployed site direct navigation)
  useEffect(() => {
    const calendarConnectedParam = searchParams.get('calendar_connected');
    if (calendarConnectedParam === 'true') {
      console.log('[Stage7] OAuth callback via URL param detected');
      toast.success("Calendar connected successfully!");
      setCalendarConnected(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleToggleCalendar = async (checked: boolean) => {
    console.log('[Calendar] Toggle called:', { checked, calendarConnected, connecting, userId: appUser?.id });
    
    if (connecting) {
      console.log('[Calendar] Already connecting, skipping');
      return;
    }

    if (!appUser?.id) {
      toast.error("Please log in to manage your calendar");
      return;
    }
    
    // Handle DISCONNECT (toggle OFF)
    if (!checked && calendarConnected) {
      console.log('[Calendar] Disconnecting calendar');
      setConnecting(true);
      setCalendarConnected(false); // Optimistic update
      
      try {
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { action: 'disconnect', provider: 'google', userId: appUser.id }
        });

        console.log('[Calendar] Disconnect response:', { data, error });

        if (error) throw error;

        toast.success("Calendar disconnected");
      } catch (error) {
        console.error('[Calendar] Disconnect error:', error);
        toast.error("Failed to disconnect calendar. Please try again.");
        setCalendarConnected(true);
      } finally {
        setConnecting(false);
      }
      return;
    }
    
    // Handle CONNECT (toggle ON)
    if (checked && !calendarConnected) {
      console.log('[Calendar] Initiating connection flow');
      setConnecting(true);
      setCalendarConnected(true); // Optimistic update
      
      try {
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { action: 'connect', provider: 'google', userId: appUser.id }
        });

        console.log('[Calendar] Connect response:', { data, error });

        if (error) {
          console.error('[Calendar] Edge function error:', error);
          throw error;
        }

        if (data?.authUrl) {
          console.log('[Calendar] Opening Google OAuth popup:', data.authUrl);
          
          // Open OAuth in popup window (works in iframe and deployed)
          const width = 600;
          const height = 700;
          const left = window.screenX + (window.outerWidth - width) / 2;
          const top = window.screenY + (window.outerHeight - height) / 2;
          
          const popup = window.open(
            data.authUrl,
            'google-calendar-auth',
            `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
          );
          
          if (!popup) {
            toast.error("Popup blocked", {
              description: "Please allow popups for this site and try again."
            });
            setCalendarConnected(false);
            setConnecting(false);
          } else {
            toast.info("Complete authorization in the popup window");
            
            // Monitor popup - if closed without success message, revert toggle
            const popupChecker = setInterval(() => {
              if (popup.closed) {
                clearInterval(popupChecker);
                // Only revert if we're still in connecting state (no success message received)
                setConnecting(prev => {
                  if (prev) {
                    console.log('[Calendar] Popup closed without completing OAuth');
                    setCalendarConnected(false);
                    toast.error("Connection cancelled", {
                      description: "The authorization window was closed."
                    });
                  }
                  return false;
                });
              }
            }, 500);
          }
        } else {
          throw new Error('No authorization URL received from server');
        }
      } catch (error) {
        console.error('[Calendar] Connection failed:', error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        
        toast.error("Failed to connect calendar", {
          description: errorMsg.includes('403') || errorMsg.includes('access') 
            ? "Google OAuth may need verification. See tip below." 
            : errorMsg
        });
        
        // Show helpful tip for 403/access errors
        if (errorMsg.includes('403') || errorMsg.includes('access')) {
          setTimeout(() => {
            toast.info("Tip: Google OAuth 403 Fix", {
              description: "In Google Cloud Console, ensure your OAuth consent screen's Privacy Policy and Terms URLs are publicly accessible (not private Google Docs).",
              duration: 10000,
            });
          }, 1500);
        }
        
        setCalendarConnected(false);
        setConnecting(false);
      }
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
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Optional • Can be set up later in Settings
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