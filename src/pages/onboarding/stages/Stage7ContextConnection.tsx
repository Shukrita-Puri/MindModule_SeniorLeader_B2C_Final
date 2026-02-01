import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar, Watch, Loader2 } from "lucide-react";
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

  // Helper function to check calendar status via edge function
  const fetchCalendarStatus = async () => {
    const accessToken = await getAccessTokenSilently();
    const { data, error } = await supabase.functions.invoke("check-calendar-status", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw error;
    return data as { connected: boolean; provider: string | null; updated_at: string | null };
  };

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

  // Check existing connection on mount using edge function
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (!appUser?.id) return;
      
      setCheckingConnection(true);
      try {
        const status = await fetchCalendarStatus();
        if (status.connected) {
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
            
            // Poll using edge function to detect successful connection
            const pollForConnection = async () => {
              const maxAttempts = 80; // 2 minutes at 1.5s intervals
              for (let i = 0; i < maxAttempts; i++) {
                try {
                  const status = await fetchCalendarStatus();
                  if (status.connected) {
                    console.log('[Calendar] Connection detected via edge function poll');
                    setCalendarConnected(true);
                    setConnecting(false);
                    toast.success("Calendar connected successfully!");
                    triggerCalendarSync();
                    return true;
                  }
                } catch (e) {
                  console.error('[Calendar] Poll error:', e);
                }
                await new Promise(r => setTimeout(r, 1500));
              }
              return false;
            };
            
            pollForConnection().then(connected => {
              if (!connected) {
                setConnecting(false);
                setCalendarConnected(false);
              }
            });
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

  const handleComplete = () => {
    const contextData = {
      calendar: {
        enabled: calendarConnected,
        provider: calendarConnected ? 'google' : null,
        setupCompletedAt: calendarConnected ? new Date().toISOString() : null,
        skipped: !calendarConnected
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
              {connecting ? (
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              ) : (
                <Calendar className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="font-medium">Google Calendar</span>
            </div>
            <Switch 
              checked={calendarConnected} 
              onCheckedChange={handleToggleCalendar}
              disabled={checkingConnection || connecting}
            />
          </div>
          
          {/* Apple Watch - coming soon */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-dashed">
            <div className="flex items-center gap-3">
              <Watch className="w-5 h-5 text-muted-foreground/50" />
              <span className="font-medium text-muted-foreground/70">Apple Watch</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Soon
              </span>
            </div>
            <Switch disabled checked={false} />
          </div>
          
        </div>

        {/* Single CTA */}
        <Button onClick={handleComplete} className="w-full" disabled={checkingConnection}>
          Continue
        </Button>

        {/* Subtle footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          You can change this anytime in settings
        </p>

      </div>
    </div>
  );
}
