import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isNativeApp } from "@/utils/healthKitCapacitor";
import { requestHRVPermission, getHRV } from "@/services/healthkit";
import { syncHealthKitToBackend } from "@/services/wearableSyncService";
import { getAuthToken } from "@/services/authTokenService";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@/utils/openUrl";
import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';

/** Backend-verified calendar connection status. */
async function checkCalendarStatus(): Promise<{ connected: boolean; provider: string | null }> {
  try {
    const token = await getAuthToken();
    if (!token) return { connected: false, provider: null };

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/check-calendar-status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.warn("[Stage7] check-calendar-status failed:", res.status);
      return { connected: false, provider: null };
    }

    const data = await res.json();
    return { connected: !!data.connected, provider: data.provider ?? null };
  } catch (err) {
    console.warn("[Stage7] check-calendar-status error:", err);
    return { connected: false, provider: null };
  }
}

/** Request a Google OAuth URL from the calendar-auth edge function. */
async function requestCalendarAuthUrl(redirectPath: string): Promise<string | null> {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.error("[Stage7] No auth token available for calendar connect");
      return null;
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/calendar-auth`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "connect",
          provider: "google",
          redirectPath,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Stage7] calendar-auth connect failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    return data.authUrl || null;
  } catch (err) {
    console.error("[Stage7] calendar-auth connect error:", err);
    return null;
  }
}

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, refreshProfile } = useAuth();
  const { recordStep } = useOnboardingProgress();

  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // On mount: check existing connection status from backend
  const verifyConnection = useCallback(async () => {
    setCheckingStatus(true);
    const status = await checkCalendarStatus();
    setCalendarEnabled(status.connected);
    setCheckingStatus(false);
    return status;
  }, []);

  useEffect(() => {
    const calendarCallback = searchParams.get("calendar_connected");

    if (calendarCallback === "true") {
      // OAuth callback — verify with backend before trusting URL param
      searchParams.delete("calendar_connected");
      setSearchParams(searchParams, { replace: true });

      verifyConnection().then(async (status) => {
        if (status.connected) {
          console.log("[Stage7] ✅ Calendar verified connected after callback");
          toast.success("Google Calendar connected successfully");
          
          // Trigger initial sync so calendar_events are populated before plan generation
          try {
            const token = await getAuthToken();
            if (token) {
              const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
              console.log("[Stage7] Triggering initial calendar sync...");
              const syncRes = await fetch(
                `https://${projectId}.supabase.co/functions/v1/sync-calendar`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ provider: status.provider || "google" }),
                }
              );
              if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.reconnectRequired) {
                  console.warn("[Stage7] ⚠️ Calendar reconnect required:", syncData.reason);
                  toast.error("Calendar session expired. Please reconnect your calendar.");
                } else if (syncData.skipped) {
                  console.warn("[Stage7] ⚠️ Sync skipped:", syncData.reason);
                  toast.error(syncData.error || "Calendar is disconnected.");
                } else if (syncData.success === true) {
                  console.log("[Stage7] ✅ Initial sync complete:", syncData.eventCount, "events");
                  queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
                } else {
                  console.warn("[Stage7] ⚠️ Sync returned failure:", syncData.error);
                }
              } else {
                console.warn("[Stage7] ⚠️ Initial sync failed:", syncRes.status);
              }
            }
          } catch (syncErr) {
            console.warn("[Stage7] ⚠️ Sync error (non-blocking):", syncErr);
          }
        } else {
          console.warn("[Stage7] ⚠️ Calendar not verified after callback");
          toast.error("Calendar connection could not be verified");
        }
      });
    } else {
      // Normal mount — check existing status
      verifyConnection();
    }
  }, [verifyConnection, searchParams, setSearchParams]);

  // Handle Google Calendar toggle — uses calendar-auth edge function (no re-auth)
  const handleCalendarToggle = async (checked: boolean) => {
    if (!checked) {
      setCalendarEnabled(false);
      return;
    }

    if (!isAuthenticated) {
      toast.error("Please complete sign-up first to connect your calendar");
      return;
    }

    setLoading(true);

    try {
      console.log("[Stage7] Starting Google Calendar connect via calendar-auth edge function");

      const authUrl = await requestCalendarAuthUrl("/onboarding/context-connection");

      if (!authUrl) {
        toast.error("Failed to start calendar connection");
        setLoading(false);
        return;
      }

      console.log("[Stage7] Redirecting to Google OAuth (via edge function URL)");

      // Redirect to Google consent — the edge function callback will redirect
      // back to /onboarding/context-connection?calendar_connected=true
      await openUrl(authUrl);

      // Keep loading until redirect completes
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[Stage7] Calendar connect failed:", msg);
      toast.error("Failed to start calendar connection");
      setCalendarEnabled(false);
      setLoading(false);
    }
  };

  // Handle Apple Watch toggle — native HealthKit or preference-only
  const handleWatchToggle = async (checked: boolean) => {
    if (checked && isNativeApp()) {
      try {
        await requestHRVPermission();
        toast.success("Apple Watch connected via HealthKit");
        try {
          const hrvData = await getHRV();
          console.log("HRV samples:", hrvData);
        } catch (hrvErr) {
          console.error("Failed to fetch HRV:", hrvErr);
        }
        // Persist HealthKit data to backend
        syncHealthKitToBackend().then((ok) => {
          if (ok) console.log("[Stage7] HealthKit data synced to backend");
        });
      } catch (err) {
        console.error("HealthKit permission denied ❌", err);
        toast.error("HealthKit permissions are required for Apple Watch integration");
        return;
      }
    } else if (checked) {
      toast.info("Apple Watch will connect when you install the mobile app");
    }

    setWatchEnabled(checked);
  };

  const handleComplete = async () => {
    recordStep("context_connection", {
      context_calendar_enabled: calendarEnabled,
      context_watch_enabled: watchEnabled,
      completed: true,
    });

    try {
      const token = await getAuthToken();
      if (token) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              calendar_provider: calendarEnabled ? "google" : null,
              watch_type: watchEnabled ? (isNativeApp() ? "apple" : "apple_pending") : null,
            }),
          }
        );
        if (res.ok) {
          console.log("[Stage7] ✅ Onboarding marked complete");
          await refreshProfile();
        } else {
          console.warn("[Stage7] ⚠️ complete-onboarding failed:", res.status);
        }
      }
    } catch (err) {
      console.warn("[Stage7] ⚠️ complete-onboarding error:", err);
    }

    console.log("[Stage7] Context preferences saved, navigating to daily check-in");
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
              <img src={googleCalendarLogo} alt="Google Calendar" className="w-8 h-8 rounded-lg object-contain" />
              <div className="flex flex-col">
                <span className="font-medium">Google Calendar</span>
                <span className="text-xs text-muted-foreground">
                  {checkingStatus
                    ? "Checking…"
                    : calendarEnabled
                      ? "Connected"
                      : "Sync your schedule"}
                </span>
              </div>
            </div>
            <Switch
              checked={calendarEnabled}
              onCheckedChange={handleCalendarToggle}
              disabled={loading || checkingStatus}
            />
          </div>

          {/* Apple Health */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/65 backdrop-blur-[30px] border border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <img src={appleHealthIcon} alt="Apple Health" className="w-8 h-8 rounded-lg object-contain" />
              <div className="flex flex-col">
                <span className="font-medium">Apple Health</span>
                <span className="text-xs text-muted-foreground">
                  {isNativeApp() ? "HealthKit integration" : "Available in mobile app"}
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

        {/* Subtle footer with legal links */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground/60">
            You can change this anytime in settings
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Terms of Use
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
