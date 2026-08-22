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
import { startFirstSessionTour } from "@/utils/firstSessionTour";
import { useQueryClient } from "@tanstack/react-query";
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';
import uspConstellation from '@/assets/onboarding/usp-constellation.jpg';
import CalendarProviderPicker, { fetchCalendarProvidersState } from '@/components/calendar/CalendarProviderPicker';

// This is dot index 4 in the 5-dot sequence (intro=0, usp1=1, usp2=2, usp3=3, context=4)
const TOTAL_DOTS = 5;
const ACTIVE_DOT = 4;

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, refreshProfile, user } = useAuth();
  const { recordStep } = useOnboardingProgress();

  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchSyncStatus, setWatchSyncStatus] = useState<string | null>(null);
  // When a wearable is connected we ask whether the user also wants self check-ins.
  // Default = true (no surprise data loss for users who don't actively choose).
  const [selfCheckInsEnabled, setSelfCheckInsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [connectedCalendarProvider, setConnectedCalendarProvider] = useState<'google' | 'microsoft' | 'apple' | null>(null);

  // On mount: check existing per-provider connection status
  const verifyConnection = useCallback(async () => {
    const result = await fetchCalendarProvidersState();
    const providers = result.providers;
    const provider =
      providers.google?.connected ? 'google' :
      providers.microsoft?.connected ? 'microsoft' :
      providers.apple?.connected ? 'apple' :
      null;
    setConnectedCalendarProvider(provider);
    setCalendarEnabled(!!provider);
    return { connected: !!provider, provider };
  }, []);

  useEffect(() => {
    const calendarCallback = searchParams.get("calendar_connected");
    const checkoutSessionId = searchParams.get("session_id");

    if (checkoutSessionId) {
      recordStep("payment", {
        completed: true,
        reason: "stripe_checkout_return",
      });

      const next = new URLSearchParams(searchParams);
      next.delete("session_id");
      setSearchParams(next, { replace: true });

      const refreshDelays = [0, 1500, 3500];
      refreshDelays.forEach((delay) => {
        window.setTimeout(() => {
          refreshProfile().catch((err) => {
            console.warn("[Stage7] Profile refresh after checkout return failed:", err);
          });
        }, delay);
      });
    }

    if (calendarCallback === "true") {
      searchParams.delete("calendar_connected");
      setSearchParams(searchParams, { replace: true });

      verifyConnection().then(async (status) => {
        if (status.connected) {
          console.log("[Stage7] ✅ Calendar verified connected after callback");
          toast.success("Calendar connected successfully");
          
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
  }, [verifyConnection, searchParams, setSearchParams, queryClient, recordStep, refreshProfile]);

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
        toast.success("Apple Health connected. Catching up in the background.");
        setWatchSyncStatus("Connected · Catching up");
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
      context_self_check_ins_enabled: watchEnabled ? selfCheckInsEnabled : true,
      completed: true,
    });

    if (DEV_MODE) {
      const target = startFirstSessionTour({ userId: user?.id, source: 'onboarding' });
      navigate(target);
      return;
    }

    // Attempt to mark onboarding complete on the backend
    let completionSucceeded = false;
    try {
      const token = await getAuthToken();
      if (token) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const body = JSON.stringify({
          calendar_provider: connectedCalendarProvider,
          watch_type: watchEnabled ? (isNativeApp() ? "apple" : "apple_pending") : null,
          // No wearable → self check-ins always enabled (Mode C). With a wearable, honour the toggle.
          self_check_ins_enabled: watchEnabled ? selfCheckInsEnabled : true,
        });
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
          { method: "POST", headers, body }
        );

        if (res.ok) {
          console.log("[Stage7] ✅ Onboarding marked complete");
          completionSucceeded = true;
        } else {
          console.warn("[Stage7] ⚠️ complete-onboarding failed:", res.status, "— retrying");
          const retry = await fetch(
            `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
            { method: "POST", headers, body }
          );
          if (retry.ok) {
            console.log("[Stage7] ✅ Onboarding marked complete (retry)");
            completionSucceeded = true;
          } else {
            console.error("[Stage7] ❌ complete-onboarding retry also failed:", retry.status);
          }
        }
      } else {
        console.warn("[Stage7] No auth token — skipping completion call");
      }
    } catch (err) {
      console.warn("[Stage7] ⚠️ complete-onboarding error (non-blocking):", err);
    }

    // Await profile refresh so onboarding_completed_at is populated before navigation
    try {
      await refreshProfile();
      console.log("[Stage7] ✅ Profile refreshed after completion");
    } catch (err) {
      console.warn("[Stage7] ⚠️ refreshProfile error (non-blocking):", err);
    }

    // Set tour session keys BEFORE navigation so DailyCheckIn sees them immediately.
    // Uses the shared helper so the user-id binding and intro flag are reset
    // identically to the retake path — preventing first-time tours from being
    // rejected by the user-bound guards in DailyCheckIn / ExecutiveHome.
    const target = startFirstSessionTour({ userId: user?.id, source: 'onboarding' });
    console.log("[Stage7] Navigating to daily check-in with tour", { target });
    navigate(target);
  };

  return (
    <div className="fixed inset-0 bg-app-surface flex flex-col">
      {/* Subtle background accent image */}
      <img
        src={uspConstellation}
        alt=""
        aria-hidden="true"
        className="absolute inset-x-0 top-0 w-full h-[40vh] object-cover opacity-10 pointer-events-none"
      />
      <div className="absolute inset-x-0 top-0 h-[40vh] bg-gradient-to-b from-transparent via-background/70 to-background pointer-events-none" />

      {/* Back button top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-[#cfc7b8] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 py-2">
          <Button variant="glass" size="sm" onClick={() => navigate("/onboarding/app-intro", { state: { resumeSlide: 2 } })}>
            <ChevronLeft size={20} />
          </Button>
          <div />
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="relative z-10 flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top,0px))] px-6">
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
            {/* Calendar — unified picker for Apple / Google / Microsoft */}
            <CalendarProviderPicker
              redirectPath="/onboarding/context-connection"
              onChanged={() => { verifyConnection(); }}
            />

            {/* Apple Health */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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

            {/* Self check-in preference — only when a wearable is connected */}
            {watchEnabled && (
              <div className="p-4 rounded-2xl bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-3">
                <div>
                  <p className="font-medium text-sm text-foreground leading-snug">
                    Would you also like to complete daily self check-ins for a more rounded assessment?
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelfCheckInsEnabled(true)}
                    className={`text-left text-sm rounded-xl px-3 py-2.5 border transition-colors ${
                      selfCheckInsEnabled
                        ? "border-saffron bg-saffron/10 text-foreground"
                        : "border-[#cfc7b8] bg-white/40 text-foreground/80 hover:bg-white/60"
                    }`}
                    aria-pressed={selfCheckInsEnabled}
                  >
                    Yes — I'm happy to complete short daily self check-ins.
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfCheckInsEnabled(false)}
                    className={`text-left text-sm rounded-xl px-3 py-2.5 border transition-colors ${
                      !selfCheckInsEnabled
                        ? "border-saffron bg-saffron/10 text-foreground"
                        : "border-[#cfc7b8] bg-white/40 text-foreground/80 hover:bg-white/60"
                    }`}
                    aria-pressed={!selfCheckInsEnabled}
                  >
                    No — I'd prefer the wearable to do the heavy lifting.
                  </button>
                </div>
                <p className="text-xs text-muted-foreground/70">You can change this later in settings.</p>
              </div>
            )}
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
