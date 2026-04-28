import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

export interface BriefSnapshotRecord {
  id: string;
  user_id: string;
  local_date: string;
  time_window: string;
  daily_checkin_id: string | null;
  phrase: string | null;
  body_text: string | null;
  lean_on: string | null;
  lean_on_source: string | null;
  watch_for: string | null;
  watch_for_source: string | null;
  score: number | null;
  tier: string | null;
  brief_source: string | null;
  driver: string | null;
  /**
   * Structured wearable readings captured at brief generation time.
   * Used to re-render Signal Pills (Decision Readiness, Physical Reserves,
   * Resilience Capacity) for historical briefs and trend analysis on Insights.
   */
  wearable_snapshot: WearableSnapshot | null;
  /**
   * Check-in inputs (sliders + outcome) that drove the brief, frozen in time.
   */
  checkin_snapshot: CheckinSnapshot | null;
  /**
   * Reserved: server-computed Signal Pills payload (currently null;
   * client derives pills from `wearable_snapshot` + `checkin_snapshot`).
   */
  signal_pills: unknown | null;
  created_at: string;
}

export interface WearableSnapshot {
  hrv: number | null;
  hrvDeviation: number | null;
  hrvBaseline: number | null;
  rhr: number | null;
  rhrDeviation: number | null;
  rhrBaseline: number | null;
  hr: number | null;
  hrDeviation: number | null;
  hrBaseline: number | null;
  sleepDuration: number | null;
  sleepScore: number | null;
  sleepDeviation: number | null;
  sleepBaseline: number | null;
  wearableConnected: boolean;
  wearableTrend7d: string | null;
  scoreTrajectory7d: string | null;
  dataSource: string | null;
  sourceRowDate: string | null;
  capturedAt: string;
}

export interface CheckinSnapshot {
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  mentalSharpnessLevel: number | null;
  consecutiveLowConfidence: number | null;
  consecutiveLowClarity: number | null;
}

const getAccessTokenOrAnon = async (): Promise<string | null> => {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  }
  return await getAuthToken();
};

export const useBriefSnapshot = (briefId: string | null | undefined) => {
  return useQuery<BriefSnapshotRecord | null>({
    queryKey: ['brief-snapshot', briefId],
    enabled: !!briefId,
    staleTime: Infinity,
    queryFn: async () => {
      if (!briefId) return null;
      const token = await getAccessTokenOrAnon();
      if (!token) return null;

      const { data, error } = await supabase.functions.invoke('brief-by-id', {
        headers: { Authorization: `Bearer ${token}` },
        body: { briefId },
      });

      if (error) {
        console.error('[useBriefSnapshot] error:', error);
        return null;
      }
      return (data?.data as BriefSnapshotRecord) || null;
    },
  });
};