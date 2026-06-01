import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CheckInMode = "wearable_plus_self" | "wearable_only" | "self_declared_only";

export interface CheckInModeState {
  mode: CheckInMode;
  wearableConnected: boolean;
  selfCheckInsEnabled: boolean;
  showDailyCheckIn: boolean;
  showCheckInDetail: boolean;
  /** Where the Mind State Check CTA should route on submit. */
  dailyCtaTarget: "/check-in-detail" | "/executive-home";
  dailyCtaLabel: string;
  isLoading: boolean;
}

/**
 * Derives the user's check-in experience mode based on persisted onboarding
 * preferences. Pure UI/visibility helper — does NOT touch scoring, briefs,
 * plans, or any backend pipeline.
 */
export function useCheckInMode(): CheckInModeState {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["check-in-mode", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return { wearableConnected: false, selfCheckInsEnabled: true };

      const [profileRes, integrationRes] = await Promise.all([
        supabase
          .from("profiles")
          // self_check_ins_enabled is a new column; cast to any for safety until types regenerate.
          .select("self_check_ins_enabled" as unknown as "id")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("user_integrations")
          .select("watch_type, watch_connection_status")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const profileRow = (profileRes.data ?? {}) as { self_check_ins_enabled?: boolean | null };
      const integration = integrationRes.data as
        | { watch_type?: string | null; watch_connection_status?: string | null }
        | null;

      const watchType = integration?.watch_type ?? null;
      // "apple_pending" means the user opted in but is not on native yet — treat as connected
      // so we honour their onboarding intent. Disconnected explicitly clears the flag.
      const wearableConnected =
        !!watchType && integration?.watch_connection_status !== "disconnected";

      // Default to true when null so existing users behave exactly as today.
      const selfCheckInsEnabled = profileRow.self_check_ins_enabled !== false;

      return { wearableConnected, selfCheckInsEnabled };
    },
  });

  const wearableConnected = data?.wearableConnected ?? false;
  const selfCheckInsEnabled = data?.selfCheckInsEnabled ?? true;

  const mode: CheckInMode =
    wearableConnected && selfCheckInsEnabled
      ? "wearable_plus_self"
      : wearableConnected && !selfCheckInsEnabled
        ? "wearable_only"
        : "self_declared_only";

  // Body State Check-in (/check-in-detail) is now suppressed for all modes —
  // the Mind Check-in on /daily-check-in is the sole check-in surface and
  // routes directly to the Performance Readiness Brief on /executive-home.
  const showDailyCheckIn = mode !== "wearable_only";
  const showCheckInDetail = false;
  const dailyCtaTarget: "/check-in-detail" | "/executive-home" = "/executive-home";
  const dailyCtaLabel = "Refine Performance Readiness Brief";

  return {
    mode,
    wearableConnected,
    selfCheckInsEnabled,
    showDailyCheckIn,
    showCheckInDetail,
    dailyCtaTarget,
    dailyCtaLabel,
    isLoading,
  };
}
