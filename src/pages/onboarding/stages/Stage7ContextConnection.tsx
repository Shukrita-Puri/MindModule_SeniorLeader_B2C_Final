import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { } from "lucide-react";
import { getSession } from "@/utils/onboardingStorage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNativeApp } from "@/utils/healthKitCapacitor";
import { requestHRVPermission, getHRV } from "@/services/healthkit";

import { getAuthToken } from '@/services/authTokenService';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';

/**
 * Opens a URL using Capacitor's in-app browser (SFSafariViewController / Chrome Custom Tabs)
 * on native, or window.location.href on web.
 */
async function openOAuthUrl(url: string) {
  if (isNativeApp()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, presentationStyle: 'popover' });
    } catch (e) {
      console.warn('[Stage7] Capacitor Browser not available, falling back to redirect:', e);
      window.location.href = url;
    }
  } else {
    window.location.href = url;
  }
}

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, refreshProfile } = useAuth();
  const { recordStep } = useOnboardingProgress();
  
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handle OAuth callback: check for calendar_connected param
  useEffect(() => {
    if (searchParams.get('calendar_connected') === 'true') {
      setCalendarEnabled(true);
      toast.success('Google Calendar connected successfully');
      searchParams.delete('calendar_connected');
      setSearchParams(searchParams, { replace: true });
      const prefs = { calendar: true, watch: watchEnabled };
      localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
    }
  }, []);

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
    if (!checked) {
      // Toggling off — just save preference
      setCalendarEnabled(false);
      const prefs = { calendar: false, watch: watchEnabled };
      localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
      return;
    }

    if (!isAuthenticated) {
      toast.error('Please complete sign-up first to connect your calendar');
      return;
    }

    setCalendarEnabled(true);
    setLoading(true);
    try {
      // Build request: use Auth0 token if available, fall back to userId for dev mode
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: { 
          action: 'connect', 
          provider: 'google',
          redirectPath: '/onboarding/context-connection',
          // Pass userId directly when no Auth0 token (dev mode / native)
          ...(!token && user?.id ? { userId: user.id } : {})
        },
        headers,
      });
      
      if (error) throw error;
      if (data.authUrl) {
        await openOAuthUrl(data.authUrl);
      }
    } catch (error) {
      console.error('Error connecting calendar:', error);
      toast.error('Failed to connect calendar');
      setCalendarEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle Apple Watch toggle — native HealthKit or preference-only
  const handleWatchToggle = async (checked: boolean) => {
    if (checked && isNativeApp()) {
      try {
        await requestHRVPermission();
        toast.success('Apple Watch connected via HealthKit');
        // Fetch HRV data after permission granted
        try {
          const hrvData = await getHRV();
          console.log('HRV samples:', hrvData);
        } catch (hrvErr) {
          console.error('Failed to fetch HRV:', hrvErr);
        }
      } catch (err) {
        console.error('HealthKit permission denied ❌', err);
        toast.error('HealthKit permissions are required for Apple Watch integration');
        return;
      }
    } else if (checked) {
      toast.info('Apple Watch will connect when you install the mobile app');
    }

    setWatchEnabled(checked);
    const prefs = { calendar: calendarEnabled, watch: checked };
    localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
  };

  const handleComplete = async () => {
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
    
    recordStep('context_connection', {
      context_calendar_enabled: calendarEnabled,
      context_watch_enabled: watchEnabled,
      completed: true,
    });

    // Mark onboarding as truly complete (sets onboarding_completed_at)
    try {
      const token = await getAuthToken();
      if (token) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          }
        );
        if (res.ok) {
          console.log('[Stage7] ✅ Onboarding marked complete');
          await refreshProfile();
        } else {
          console.warn('[Stage7] ⚠️ complete-onboarding failed:', res.status);
        }
      }
    } catch (err) {
      console.warn('[Stage7] ⚠️ complete-onboarding error:', err);
    }
    
    console.log('[Stage7] Context preferences saved, navigating to daily check-in');
    navigate("/daily-check-in");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-headline tracking-tight">
            Connect Context
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalise your experience
          </p>
        </div>

        {/* Integration Options with Toggles */}
        <div className="space-y-3">
          
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/65 backdrop-blur-[30px] border border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-medium">Google Calendar</span>
                <span className="text-xs text-muted-foreground">
                  {calendarEnabled ? 'Connected' : 'Sync your schedule'}
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
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/65 backdrop-blur-[30px] border border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-medium">Apple Watch</span>
                <span className="text-xs text-muted-foreground">
                  {isNativeApp() ? 'HealthKit integration' : 'Available in mobile app'}
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
          <Button onClick={handleComplete} variant="critical" className="w-full" disabled={loading}>
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
