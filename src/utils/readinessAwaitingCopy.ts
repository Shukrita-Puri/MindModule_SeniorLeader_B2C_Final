import { READINESS_AWAITING_MESSAGE } from '@/constants/awaitingSignals';
import type { OuterReadinessData } from '@/hooks/useOuterReadiness';

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

  const wearable = payload.integrationStatus?.wearable ?? payload.wearableStatus ?? null;
  const calendar = payload.integrationStatus?.calendar ?? null;

  const hasWearableSignal =
    payload.hasWearable === true ||
    wearable?.hasTodayData === true ||
    wearable?.hasRecentData === true;

  const hasCalendarSignal =
    payload.hasCalendar === true ||
    payload.calendarState === 'active' ||
    payload.calendarState === 'connected_no_events' ||
    calendar?.state === 'active' ||
    calendar?.state === 'connected_no_events' ||
    calendar?.connected === true;

  if (wearable?.connectionStatus === 'permission_revoked') {
    return 'Apple Health access needs attention — reconnect it to restore your readiness read.';
  }

  if (wearable?.connectionStatus === 'sync_delayed' || wearable?.syncStatus === 'sync_delayed') {
    return 'Apple Health is connected, but the latest sync is delayed. We’ll keep retrying.';
  }

  if (
    wearable?.connectionStatus === 'connected_but_waiting_for_data' ||
    (
      wearable?.connectionStatus === 'connected' &&
      !wearable?.hasTodayData &&
      !wearable?.hasRecentData &&
      wearable?.hasHistoricalData === true
    )
  ) {
    return 'Apple Health is connected, but no new wearable data has arrived yet.';
  }

  if (calendar?.needsReconnect || calendar?.connectionStatus === 'permission_revoked') {
    return 'Apple Calendar access needs attention — reconnect it to restore your day context.';
  }

  if (payload.calendarState === 'connected_no_events' || calendar?.state === 'connected_no_events') {
    return 'Calendar connected — no events found for this window.';
  }

  if (hasWearableSignal && !hasCalendarSignal) {
    return 'Wearable signal received — connect calendar for a fuller read.';
  }

  if (hasCalendarSignal && !hasWearableSignal) {
    return 'Calendar signal received — sync wearable for a fuller read.';
  }

  return READINESS_AWAITING_MESSAGE;
}
