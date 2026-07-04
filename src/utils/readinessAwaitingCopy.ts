import { READINESS_AWAITING_MESSAGE } from '@/constants/awaitingSignals';
import type { OuterReadinessData } from '@/hooks/useOuterReadiness';
import { deriveAwaitingReason, getAwaitingCopy } from '@/utils/readinessLabels';

type AwaitingIntegrationStatus = {
  wearable?: {
    connectionStatus?: string | null;
    syncStatus?: string | null;
    hasTodayData?: boolean;
    hasRecentData?: boolean;
    hasHistoricalData?: boolean;
  } | null;
  calendar?: {
    connectionStatus?: string | null;
    state?: string | null;
    needsReconnect?: boolean;
    connected?: boolean;
  } | null;
} | null;

export function getReadinessAwaitingCopy(
  payload?: Pick<
    OuterReadinessData,
    | 'awaitingSignals'
    | 'briefMode'
    | 'hasCurrentPeriodSignal'
    | 'hasWearable'
    | 'hasCalendar'
    | 'calendarState'
    | 'wearableStatus'
  > & { integrationStatus?: AwaitingIntegrationStatus },
): string {
  if (!payload) return READINESS_AWAITING_MESSAGE;
  return getAwaitingCopy(deriveAwaitingReason(payload));
}
