/**
 * day-of-horizon — strict 24-hour day-of anchor invariant.
 *
 * Used by `generate-mastery-plan` to gate every code path that writes a
 * named calendar event into the Plan response (anchorEventId, anchorEventTitle,
 * eventId, eventTitle, why-line, state-label). When the user is in day-of
 * mode (server `evaluateWeekAheadMode().active === false`), no event whose
 * start is more than 24 hours away from "now" may be referenced by id or
 * title. The Plan must fall back to a generic anchor ("the day ahead",
 * "your current load", "today's rhythm") instead.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.4 (day-of horizon invariant).
 */

export const DAY_OF_HORIZON_MS = 24 * 60 * 60_000;

/** True iff the event starts on or before nowMs + horizonMs. */
export function isWithinDayOfHorizon(
  event: { startTime?: string | null; start_time?: string | null } | null | undefined,
  nowMs: number,
  horizonMs: number = DAY_OF_HORIZON_MS,
): boolean {
  if (!event) return false;
  const raw = (event as { startTime?: string | null }).startTime
    ?? (event as { start_time?: string | null }).start_time
    ?? null;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  return t - nowMs <= horizonMs;
}

/**
 * Strip the named-event fields from `slot` if the user is in day-of mode
 * and the matching event is outside the 24-hour horizon. Returns the same
 * object reference for ergonomic chaining; mutates fields in place.
 */
export function gateDayOfAnchor<T extends {
  eventId?: string | null;
  eventTitle?: string | null;
}>(
  slot: T,
  event: { startTime?: string | null; start_time?: string | null } | null | undefined,
  nowMs: number,
  weekAheadActive: boolean,
  horizonMs: number = DAY_OF_HORIZON_MS,
): T {
  if (weekAheadActive) return slot;
  if (isWithinDayOfHorizon(event, nowMs, horizonMs)) return slot;
  slot.eventId = null;
  slot.eventTitle = null;
  return slot;
}