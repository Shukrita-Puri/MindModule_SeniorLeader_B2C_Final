import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isNativeApp } from "@/utils/healthKitCapacitor";
import { requestHRVPermission, getHRV } from "@/services/healthkit";
import { getAuthToken } from "@/services/authTokenService";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useAuth } from "@/hooks/useAuth";
import { CANONICAL_APP_URL } from "@/utils/authRedirect";

/**
 * Opens a URL using Capacitor's in-app browser on native, or window.location.href on web.
 */
async function openOAuthUrl(url: string) {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
    } catch (e) {
      console.warn("[Stage7] Capacitor Browser not available, falling back to redirect:", e);
      window.location.href = url;
    }
  } else {
    window.location.href = url;
  }
}

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

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, refreshProfile } = useAuth();
  const { loginWithRedirect } = useAuth0();
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

      verifyConnection().then((status) => {
        if (status.connected) {
          toast.success("Google Calendar connected successfully");
        } else {
          toast.error("Calendar connection could not be verified");
        }
      });
    } else {
      // Normal mount — check existing status
      verifyConnection();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Google Calendar toggle
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
      const token = await getAuthToken();
      if (!token) {
        toast.error("Authentication required to connect calendar");
        return;
      }

      const { data, error } = await supabase.functions.invoke("calendar-auth", {
        body: {
          action: "connect",
          provider: "google",
          redirectPath: "/onboarding/context-connection",
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      if (data?.authUrl) {
        await openOAuthUrl(data.authUrl);
      }
    } catch (error) {
      console.error("Error connecting calendar:", error);
      toast.error("Failed to connect calendar");
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
        toast.success("Apple Watch connected via HealthKit");
        try {
          const hrvData = await getHRV();
          console.log("HRV samples:", hrvData);
        } catch (hrvErr) {
          console.error("Failed to fetch HRV:", hrvErr);
        }
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

          {/* Apple Watch */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/65 backdrop-blur-[30px] border border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-medium">Apple Watch</span>
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

        {/* Subtle footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          You can change this anytime in settings
        </p>

      </div>
    </div>
  );
}
