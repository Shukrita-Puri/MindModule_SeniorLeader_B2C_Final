/**
 * Truthful toast copy for Apple Calendar sync outcomes.
 *
 * The JS layer no longer reads EventKit — the native iOS bridge owns the
 * authoritative sync. The bridge does not currently return an event count, so
 * the UI must NEVER coerce `undefined`/`null`/`NaN` into `0` and claim the
 * user synced zero events. Only a real, finite, non-negative numeric count
 * from the backend/native bridge is rendered numerically.
 */

export type AppleCalendarSyncContext = "connect" | "manual";

/** True only when the value is a finite non-negative integer. Rejects
 *  undefined / null / NaN / negative numbers / floats / strings. */
export function isValidEventCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

export function formatEventCountLabel(count: number): string {
  const noun = count === 1 ? "event" : "events";
  return `Synced ${count} ${noun}`;
}

export function appleCalendarSyncSuccessMessage(
  context: AppleCalendarSyncContext,
  eventCount: unknown,
): string {
  if (isValidEventCount(eventCount)) {
    const label = formatEventCountLabel(eventCount);
    if (context === "connect") {
      return `Apple Calendar connected — ${label.toLowerCase()}`;
    }
    return label;
  }
  // No trustworthy count — truthful generic success copy.
  return context === "connect"
    ? "Apple Calendar connected and synced"
    : "Apple Calendar sync completed";
}