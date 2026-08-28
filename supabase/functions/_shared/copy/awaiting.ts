/**
 * Shared awaiting-signals copy.
 *
 * The generic string remains the fallback when no reason-specific state is
 * available. Callers can use `buildReadinessAwaitingMessage()` to surface a
 * more precise inline explanation without changing the visual awaiting state.
 */
export const READINESS_AWAITING_MESSAGE =
  "Connect your wearable and calendar to get an early read, then check in to sharpen it.";

export interface AwaitingCopyWearableStatus {
  connectionStatus?: string | null;
  syncStatus?: string | null;
  hasTodayData?: boolean;
  hasRecentData?: boolean;
  hasHistoricalData?: boolean;
}

export interface AwaitingCopyCalendarStatus {
  connectionStatus?: string | null;
  state?: string | null;
  needsReconnect?: boolean;
  connected?: boolean;
}

export interface AwaitingCopyContext {
  awaitingSignals?: boolean | null;
  briefMode?: 'cold-start' | 'baseline' | 'refined' | null;
  hasCurrentPeriodSignal?: boolean | null;
  hasWearable?: boolean | null;
  hasCalendar?: boolean | null;
  calendarState?: 'active' | 'connected_no_events' | 'not_connected' | null;
  wearableStatus?: AwaitingCopyWearableStatus | null;
  integrationStatus?: {
    wearable?: AwaitingCopyWearableStatus | null;
    calendar?: AwaitingCopyCalendarStatus | null;
  } | null;
}

function isTruthySignal(value: boolean | null | undefined): boolean {
  return value === true;
}

export function buildReadinessAwaitingMessage(ctx: AwaitingCopyContext = {}): string {
  const wearable = ctx.integrationStatus?.wearable ?? ctx.wearableStatus ?? null;
  const calendar = ctx.integrationStatus?.calendar ?? null;

  const hasWearableSignal =
    isTruthySignal(ctx.hasWearable) ||
    isTruthySignal(wearable?.hasTodayData) ||
    isTruthySignal(wearable?.hasRecentData);

  const hasCalendarSignal =
    isTruthySignal(ctx.hasCalendar) ||
    ctx.calendarState === 'active' ||
    ctx.calendarState === 'connected_no_events' ||
    calendar?.state === 'active' ||
    calendar?.state === 'connected_no_events' ||
    isTruthySignal(calendar?.connected);

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
      isTruthySignal(wearable?.hasHistoricalData)
    )
  ) {
    return 'Apple Health is connected, but no new wearable data has arrived yet.';
  }

  if (calendar?.needsReconnect || calendar?.connectionStatus === 'permission_revoked') {
    return 'Apple Calendar access needs attention — reconnect it to restore your day context.';
  }

  if (ctx.calendarState === 'connected_no_events' || calendar?.state === 'connected_no_events') {
    return 'Calendar connected — no events found for this window.';
  }

  if (hasWearableSignal && !hasCalendarSignal) {
    return 'Wearable is connected. Connect your calendar to get an early read, then check in to sharpen it.';
  }

  if (hasCalendarSignal && !hasWearableSignal) {
    return 'Calendar is connected. Connect your wearable to get an early read, then check in to sharpen it.';
  }

  if (ctx.briefMode === 'cold-start' || ctx.awaitingSignals === true || ctx.hasCurrentPeriodSignal === false) {
    return READINESS_AWAITING_MESSAGE;
  }

  return READINESS_AWAITING_MESSAGE;
}
