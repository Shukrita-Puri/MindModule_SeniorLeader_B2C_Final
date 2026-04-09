import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DEV_MODE } from "@/config/devMode";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isNativeApp, requestHealthKitPermissions } from "@/utils/healthKitCapacitor";
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

// This is dot index 4 in the 5-dot sequence (intro=0, usp1=1, usp2=2, usp3=3, context=4)
const TOTAL_DOTS = 5;
const ACTIVE_DOT = 4;

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, refreshProfile } = useAuth();
  const { recordStep } = useOnboardingProgress();

  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchSyncStatus, setWatchSyncStatus] = useState<string | null>(null);
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
      searchParams.delete("calendar_connected");
      setSearchParams(searchParams, { replace: true });

      verifyConnection().then(async (status) => {
        if (status.connected) {
          console.log("[Stage7] ✅ Calendar verified connected after callback");
          toast.success("Google Calendar connected successfully");
          
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
      verifyConnection();
    }
  }, [verifyConnection, searchParams, setSearchParams, queryClient]);

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
      console.log("[Stage7] Starting Google Calendar connect via calendar-auth edge function");
      const authUrl = await requestCalendarAuthUrl("/onboarding/context-connection");

      if (!authUrl) {
        toast.error("Failed to start calendar connection");
        setLoading(false);
        return;
      }

      console.log("[Stage7] Redirecting to Google OAuth (via edge function URL)");
      await openUrl(authUrl);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[Stage7] Calendar connect failed:", msg);
      toast.error("Failed to start calendar connection");
      setCalendarEnabled(false);
      setLoading(false);
    }
  };

  // Handle Apple Health toggle
  const handleWatchToggle = async (checked: boolean) => {
    if (!checked) {
      setWatchEnabled(false);
      setWatchSyncStatus(null);
      return;
    }

    if (!isNativeApp()) {
      toast.info("Apple Health will connect when you install the mobile app");
      setWatchEnabled(true);
      return;
    }

    try {
      console.log("[Stage7] Starting Apple Health connect flow...");
      setWatchSyncStatus("Requesting permission...");

      const granted = await requestHealthKitPermissions();
      
      if (!granted) {
        console.warn("[Stage7] HealthKit permission denied or verification failed");
        toast.error("HealthKit permissions are required. Please enable in Settings > Privacy > Health.");
        setWatchSyncStatus(null);
        return;
      }

      console.log("[Stage7] HealthKit permission verified, syncing data...");
      setWatchEnabled(true);
      setWatchSyncStatus("Syncing data...");

      const result = await syncHealthKitToBackend();
      console.log("[Stage7] Sync result:", JSON.stringify(result));

      if (result.connectionState === 'connected') {
        toast.success("Apple Health connected and data synced");
        setWatchSyncStatus("Synced ✓");
      } else if (result.connectionState === 'connected_but_waiting_for_data') {
        toast.success("Apple Health connected. HRV data will sync once available.");
        setWatchSyncStatus("Connected · No HRV data yet");
      } else if (result.connectionState === 'sync_delayed') {
        toast.warning("Apple Health is connected, but sync is delayed. The app will retry.");
        setWatchSyncStatus("Connected · Sync delayed");
      } else if (result.connectionState === 'permission_revoked') {
        toast.error("Apple Health permission was revoked. Please re-enable it in Health settings.");
        setWatchSyncStatus("Permission revoked");
      } else {
        toast.warning("Apple Health connected but sync incomplete. Data will sync on next app open.");
        setWatchSyncStatus("Connected · Sync pending");
      }
    } catch (err) {
      console.error("[Stage7] HealthKit connect error:", err);
      toast.error("Failed to connect Apple Health");
      setWatchSyncStatus(null);
      setWatchEnabled(false);
    }
  };

  const handleComplete = async () => {
    await recordStep("context_connection", {
      context_calendar_enabled: calendarEnabled,
      context_watch_enabled: watchEnabled,
      completed: true,
    });

    if (DEV_MODE) {
      navigate("/daily-check-in?tour=1");
      return;
    }

    let completionSucceeded = false;

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
          completionSucceeded = true;
          await refreshProfile();
        } else {
          console.warn("[Stage7] ⚠️ complete-onboarding failed:", res.status);
          const retry = await fetch(
            `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                calendar_provider: calendarEnabled ? "google" : null,
                watch_type: watchEnabled ? (isNativeApp() ? "apple" : "apple_pending") : null,
              }),
            }
          );
          if (retry.ok) {
            console.log("[Stage7] ✅ Onboarding marked complete (retry)");
            completionSucceeded = true;
            await refreshProfile();
          } else {
            console.error("[Stage7] ❌ complete-onboarding retry also failed:", retry.status);
          }
        }
      }
    } catch (err) {
      console.warn("[Stage7] ⚠️ complete-onboarding error:", err);
    }

    if (completionSucceeded) {
      console.log("[Stage7] Context preferences saved, navigating to daily check-in");
      navigate("/daily-check-in");
    } else {
      console.warn("[Stage7] Completion failed, staying on context step");
      toast.error("We couldn't finish setup yet. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Back button top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 py-2">
          <Button variant="glass" size="sm" onClick={() => navigate("/onboarding/app-intro", { state: { resumeSlide: 2 } })}>
            <ArrowLeft size={20} />
          </Button>
          <div />
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pt-14 px-6">
        <div className="w-full max-w-sm mx-auto py-8 space-y-8">

          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-[1.75rem] font-headline font-bold tracking-tight text-foreground leading-tight">
              Connect Your Intelligence Layer
            </h1>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Your calendar and wearable powers everything you saw – the state read, the proactive plans, the patterns.
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
                    {watchSyncStatus 
                      ? watchSyncStatus
                      : isNativeApp() 
                        ? "HealthKit integration" 
                        : "Available in mobile app"}
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
              <span className="text-muted-foreground/40 text-xs">·</span>
              <Link to="/powered-by-ai" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Powered by AI
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: dots + CTAs pinned */}
      <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === ACTIVE_DOT
                  ? "w-6 bg-saffron"
                  : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleComplete}
            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2"
          >
            Skip for now
          </button>
          <Button
            onClick={handleComplete}
            variant="critical"
            size="lg"
            className="w-full rounded-2xl"
            disabled={loading}
          >
            Show me how my day is calibrated
          </Button>
        </div>
      </div>
    </div>
  );
}
