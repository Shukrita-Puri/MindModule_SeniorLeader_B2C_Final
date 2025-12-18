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
import { useAuth0 } from "@auth0/auth0-react";
// Mobile detection helper
const isMobileDevice = () => {
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: appUser } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Handle OAuth callback (for both popup message and redirect)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'calendar_connected') {
        console.log('[Stage7] Received OAuth popup message:', event.data);
        
        if (event.data.success) {
          toast.success("Calendar connected successfully!");
          setCalendarConnected(true);
          setConnecting(false);
          await triggerCalendarSync();
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

  // Handle OAuth redirect callback via URL params
  useEffect(() => {
    const calendarConnectedParam = searchParams.get('calendar_connected');
    const calendarError = searchParams.get('calendar_error');
    
    if (calendarConnectedParam === 'true') {
      console.log('[Stage7] OAuth callback via URL param detected');
      toast.success("Calendar connected successfully!");
      setCalendarConnected(true);
      setConnecting(false);
      setSearchParams({});
      triggerCalendarSync();
    } else if (calendarError) {
      console.log('[Stage7] OAuth error via URL param:', calendarError);
      toast.error("Calendar connection failed", {
        description: calendarError || "Please try again."
      });
      setCalendarConnected(false);
      setConnecting(false);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Check existing connection on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (!appUser?.id) return;
      
      setCheckingConnection(true);
      try {
        const { data: connection } = await supabase
          .from('calendar_connections')
          .select('is_active')
          .eq('user_id', appUser.id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (connection?.is_active) {
          setCalendarConnected(true);
        }
      } catch (error) {
        console.error('[Stage7] Error checking connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkExistingConnection();
  }, [appUser?.id]);

  const triggerCalendarSync = async () => {
    try {
      console.log('[Stage7] Triggering initial calendar sync');
      const accessToken = await getAccessTokenSilently();
      
      const { error } = await supabase.functions.invoke('sync-calendar', {
        body: { provider: 'google' },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
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
      toast.error("Sync failed", {
        description: "Could not sync calendar. Please try again."
      });
    } finally {
      setConnecting(false);
    }
  };

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
      setCalendarConnected(false);
      
      try {
        const accessToken = await getAccessTokenSilently();
        
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { action: 'disconnect', provider: 'google', userId: appUser.id },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
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
      setCalendarConnected(true);
      
      try {
        // Build the redirect URL for after OAuth completes
        const callbackRedirect = `${window.location.origin}/onboarding/context-connection?calendar_connected=true`;
        
        const accessToken = await getAccessTokenSilently();
        
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { 
            action: 'connect', 
            provider: 'google', 
            userId: appUser.id,
            redirectTo: callbackRedirect
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        console.log('[Calendar] Connect response:', { data, error });

        if (error) {
          console.error('[Calendar] Edge function error:', error);
          throw error;
        }

        if (data?.authUrl) {
          const isMobile = isMobileDevice();
          console.log('[Calendar] Opening Google OAuth:', { isMobile, authUrl: data.authUrl });
          
          if (isMobile) {
            // On mobile, use direct redirect - popups are unreliable
            window.location.href = data.authUrl;
          } else {
            // On desktop, try popup first with fallback to redirect
            const authWindow = window.open(data.authUrl, '_blank', 'width=600,height=700');
            
            if (!authWindow || authWindow.closed) {
              // Popup blocked - fall back to redirect
              console.log('[Calendar] Popup blocked, falling back to redirect');
              window.location.href = data.authUrl;
              return;
            }
            
            toast.info("Complete authorization in the new window", {
              description: "This page will update automatically when complete."
            });
            
            // Poll database to detect successful connection
            const pollInterval = setInterval(async () => {
              const { data: connection } = await supabase
                .from('calendar_connections')
                .select('is_active, updated_at')
                .eq('user_id', appUser.id)
                .eq('is_active', true)
                .maybeSingle();
              
              if (connection?.is_active) {
                clearInterval(pollInterval);
                console.log('[Calendar] Connection detected via database poll');
                setCalendarConnected(true);
                setConnecting(false);
                toast.success("Calendar connected successfully!");
                triggerCalendarSync();
              }
            }, 1500);
            
            // Stop polling after 2 minutes
            setTimeout(() => {
              clearInterval(pollInterval);
              if (connecting) {
                setConnecting(false);
                setCalendarConnected(false);
              }
            }, 120000);
          }
        } else {
          throw new Error('No authorization URL received from server');
        }
      } catch (error) {
        console.error('[Calendar] Connection failed:', error);
        toast.error("Failed to connect calendar");
        setCalendarConnected(false);
        setConnecting(false);
      }
    }
  };

  const handleComplete = (skipCalendar = false) => {
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
    
    const session = getSession();
    if (session) {
      session.responses.onboardingCompleted = true;
      session.responses.completedAt = new Date().toISOString();
      localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
    }
    
    console.log('[Stage7] Context connection saved, navigating to daily check-in');
    navigate("/daily-check-in");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
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
    </div>
  );
}
