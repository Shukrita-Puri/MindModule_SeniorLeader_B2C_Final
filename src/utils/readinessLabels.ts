/**
 * User-facing readiness copy.
 *
 * Spec: replace tier-word display ("Strong", "Peak", etc.) on Brief / Home /
 * MRS surfaces with a one-line read keyed off the raw score. Internal tier
 * names remain lowercase strings for logic/logging/prompt seeding.
 *
 * Also replaces the visible "(Refined)" / "(Baseline)" badge wording with
 * "Full read" / "Early read" plus a subtitle.
 */

export const READINESS_ONE_LINERS: ReadonlyArray<{
  id: ReadinessBandId;
  valence: ReadinessValence;
  min: number;
  max: number;
  text: string;
}> = [
  { id: "full",     valence: "high", min: 80, max: 100, text: "full strength — go after it" },
  { id: "ready",    valence: "high", min: 65, max: 79,  text: "ready and clear" },
  { id: "holding",  valence: "mid",  min: 50, max: 64,  text: "holding the line — solid, not your peak" },
  { id: "reserves", valence: "low",  min: 35, max: 49,  text: "running on reserves — pick your battles" },
  { id: "empty",    valence: "low",  min: 0,  max: 34,  text: "running on empty — today's about protecting yourself" },
];

/** Canonical band ids — MUST stay in sync with compute-inner-readiness. */
export type ReadinessBandId = "full" | "ready" | "holding" | "reserves" | "empty";
/** Three-bucket valence used by Brief/Plan to gate copy and practice bias. */
export type ReadinessValence = "low" | "mid" | "high";

/** The five verbatim strings; used by the brief validator to reject restatement. */
export const READINESS_ONE_LINER_STRINGS: readonly string[] =
  READINESS_ONE_LINERS.map((r) => r.text);

export function getReadinessOneLiner(score: number | null | undefined): string | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of READINESS_ONE_LINERS) {
    if (s >= band.min && s <= band.max) return band.text;
  }
  return null;
}

export function getReadinessBand(score: number | null | undefined): ReadinessBandId | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of READINESS_ONE_LINERS) {
    if (s >= b.min && s <= b.max) return b.id;
  }
  return null;
}

export function getReadinessValence(score: number | null | undefined): ReadinessValence | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of READINESS_ONE_LINERS) {
    if (s >= b.min && s <= b.max) return b.valence;
  }
  return null;
}

export type ReadinessState = "baseline" | "refined" | "awaiting";
export type AwaitingReason =
  | "first_time"
  | "wearable_permission_revoked"
  | "wearable_connected_no_data"
  | "wearable_sync_delayed"
  | "calendar_permission_revoked"
  | "calendar_connected_no_events"
  | "wearable_present_calendar_missing"
  | "calendar_present_wearable_missing";

/**
 * Stage contract:
 *
 *   refined                         → "Full read"  (Stage 1 + check-in)
 *   baseline + stage-1 signal        → "Early read" (wearable/calendar baseline)
 *   baseline + no stage-1 signal     → "Awaiting signals"
 *   awaiting                         → "Awaiting signals"
 *
 * The label MUST NOT say "Early read" for true cold-start/awaiting states.
 * Pass `stageOneSignalAvailable` from the backend's explicit
 * `hasCurrentPeriodSignal` / eligibility contract when available.
 */
export function getReadinessStateLabel(
  state: ReadinessState,
  stageOneSignalAvailable: boolean = false,
): { label: string; subtitle: string } {
  if (state === "refined" && stageOneSignalAvailable) {
    return { label: "Full read", subtitle: "with your check-in" };
  }
  if (state === "refined" && !stageOneSignalAvailable) {
    return {
      label: "Awaiting signals",
      subtitle: "sync your wearable, calendar to get an early read and check in to sharpen it",
    };
  }
  if (state === "baseline" && stageOneSignalAvailable) {
    return { label: "Early read", subtitle: "check in to sharpen it" };
  }
  // awaiting, or baseline without a Stage 1 signal.
  return {
    label: "Awaiting signals",
    subtitle: "sync your wearable, calendar to get an early read and check in to sharpen it",
  };
}

type AwaitingPayload = {
  hasWearable?: boolean;
  hasCalendar?: boolean;
  calendarState?: string | null;
  wearableStatus?: {
    isConnected?: boolean;
    hasTodayData?: boolean;
    hasRecentData?: boolean;
  } | null;
  integrationStatus?: {
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
};

export function deriveAwaitingReason(payload?: AwaitingPayload): AwaitingReason {
  if (!payload) return "first_time";

  const wearable = payload.integrationStatus?.wearable ?? payload.wearableStatus ?? null;
  const calendar = payload.integrationStatus?.calendar ?? null;

  const hasWearableSignal =
    payload.hasWearable === true ||
    wearable?.hasTodayData === true ||
    wearable?.hasRecentData === true;
  const hasCalendarSignal =
    payload.hasCalendar === true ||
    payload.calendarState === "active" ||
    payload.calendarState === "connected_no_events" ||
    calendar?.state === "active" ||
    calendar?.state === "connected_no_events" ||
    calendar?.connected === true;

  if (wearable?.connectionStatus === "permission_revoked") {
    return "wearable_permission_revoked";
  }
  if (wearable?.connectionStatus === "sync_delayed" || wearable?.syncStatus === "sync_delayed") {
    return "wearable_sync_delayed";
  }
  if (
    wearable?.connectionStatus === "connected_but_waiting_for_data" ||
    (wearable?.connectionStatus === "connected" &&
      !wearable?.hasTodayData &&
      !wearable?.hasRecentData &&
      wearable?.hasHistoricalData === true)
  ) {
    return "wearable_connected_no_data";
  }
  if (calendar?.needsReconnect || calendar?.connectionStatus === "permission_revoked") {
    return "calendar_permission_revoked";
  }
  if (payload.calendarState === "connected_no_events" || calendar?.state === "connected_no_events") {
    return "calendar_connected_no_events";
  }
  if (hasWearableSignal && !hasCalendarSignal) {
    return "wearable_present_calendar_missing";
  }
  if (hasCalendarSignal && !hasWearableSignal) {
    return "calendar_present_wearable_missing";
  }
  return "first_time";
}

export function getAwaitingCopy(reason: AwaitingReason): string {
  switch (reason) {
    case "wearable_permission_revoked":
      return "Apple Health access needs attention — reconnect it to restore your readiness read.";
    case "wearable_connected_no_data":
      return "Apple Health is connected, but no new wearable data has arrived yet.";
    case "wearable_sync_delayed":
      return "Apple Health is connected, but the latest sync is delayed. We’ll keep retrying.";
    case "calendar_permission_revoked":
      return "Apple Calendar access needs attention — reconnect it to restore your day context.";
    case "calendar_connected_no_events":
      return "Calendar connected — no events found for this window.";
    case "wearable_present_calendar_missing":
      return "Wearable signal received — connect calendar for a fuller read.";
    case "calendar_present_wearable_missing":
      return "Calendar signal received — sync wearable for a fuller read.";
    case "first_time":
    default:
      return "Awaiting signals — connect your wearable and calendar to get an early read, then check in to sharpen it.";
  }
}
