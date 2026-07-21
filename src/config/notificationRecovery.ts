/**
 * Single-source tuning knobs for the iOS notification-recovery banner.
 * Adjust here to change staleness thresholds or how long a user-dismissed
 * banner stays hidden.
 */
export const NOTIFICATION_RECOVERY_CONFIG = {
  /** Days without a successful push-token persist before we surface the "stale token" banner. */
  staleTokenDays: 7,
  /** How long a user-dismissed banner stays hidden, per reason (hours). */
  dismissDurationHours: {
    provisional: 72,
    background_refresh_off: 48,
    stale_token: 24,
    // 'denied' is intentionally omitted — cannot be dismissed; user must
    // resolve in iOS Settings.
  } as Record<string, number>,
} as const;

export type NotificationRecoveryReason =
  | 'denied'
  | 'provisional'
  | 'background_refresh_off'
  | 'stale_token';

const DISMISS_STORAGE_KEY = 'mm_notification_recovery_dismissed_v1';

type DismissMap = Record<string, string>; // reason -> ISO expiry

function readDismissMap(): DismissMap {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DismissMap) : {};
  } catch {
    return {};
  }
}

function writeDismissMap(map: DismissMap): void {
  try { localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map)); } catch { /* best-effort */ }
}

export function isRecoveryReasonDismissed(reason: NotificationRecoveryReason): boolean {
  const map = readDismissMap();
  const until = map[reason];
  if (!until) return false;
  const ts = new Date(until).getTime();
  if (!Number.isFinite(ts)) return false;
  if (ts <= Date.now()) {
    // expired — clean up
    delete map[reason];
    writeDismissMap(map);
    return false;
  }
  return true;
}

export function dismissRecoveryReason(reason: NotificationRecoveryReason): void {
  const hours = NOTIFICATION_RECOVERY_CONFIG.dismissDurationHours[reason];
  if (!hours) return; // non-dismissable reasons (e.g. 'denied')
  const map = readDismissMap();
  map[reason] = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  writeDismissMap(map);
}

export function clearRecoveryDismissals(): void {
  try { localStorage.removeItem(DISMISS_STORAGE_KEY); } catch { /* best-effort */ }
}