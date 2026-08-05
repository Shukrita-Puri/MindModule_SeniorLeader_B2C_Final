/**
 * Canonical current-window signal freshness contract.
 *
 * One resolver, shared by the signal pills and the Executive Brief, so the
 * prose can never make a current-state claim from a signal the pills consider
 * unavailable for the current window.
 *
 * Window rules (preserving the existing Morning design):
 *  - Morning:   a wearable row from today OR the overnight/prior-day row
 *               (age <= 1) counts as current. This is Morning's existing
 *               design and is intentionally preserved.
 *  - Afternoon: requires a same-day row (age 0).
 *  - Evening:   requires a same-day row (age 0).
 *
 * Stale rows remain available for baselines, trends and explicitly labelled
 * historical context. They must never be promoted into a current-window
 * physiological claim.
 *
 * Check-in: only current when a non-skipped check-in row exists for today's
 * local date AND the current window (a just-submitted check-in whose row has
 * not yet been indexed is accepted via the grace path below).
 */

export type SignalWindow = "morning" | "afternoon" | "evening";

export interface SignalFreshnessInput {
  window: SignalWindow;
  /** Age in days of the wearable row backing the current metrics. */
  wearableSourceAgeDays: number | null;
  /** Whether any wearable metric exists at all (any age). */
  hasWearableData: boolean;
  /** A non-skipped daily_checkins row exists for today + this window. */
  hasCheckInRowForWindow: boolean;
}

export interface SignalFreshness {
  window: SignalWindow;
  /** Wearable metrics may be presented as the current-window physiology. */
  wearableCurrent: boolean;
  /** Wearable rows exist but only for historical/baseline/trend framing. */
  wearableHistoricalOnly: boolean;
  /** Today's check-in exists for this window. */
  checkInCurrent: boolean;
  hrvUsableAsCurrent: boolean;
  sleepUsableAsCurrent: boolean;
  rhrUsableAsCurrent: boolean;
  clarityUsableAsCurrent: boolean;
  wearableSourceAgeDays: number | null;
  /** Maximum row age (days) accepted as current for this window. */
  maxWearableAgeDays: number;
}

/** Morning is the ONLY window that accepts a prior-day wearable row. */
export function maxWearableAgeDaysForWindow(window: SignalWindow): number {
  return window === "morning" ? 1 : 0;
}

export function resolveSignalFreshness(
  input: SignalFreshnessInput,
): SignalFreshness {
  const maxAge = maxWearableAgeDaysForWindow(input.window);
  const age = input.wearableSourceAgeDays;
  const wearableCurrent = input.hasWearableData === true &&
    typeof age === "number" && age >= 0 && age <= maxAge;
  const checkInCurrent = input.hasCheckInRowForWindow === true;

  return {
    window: input.window,
    wearableCurrent,
    wearableHistoricalOnly: input.hasWearableData === true && !wearableCurrent,
    checkInCurrent,
    hrvUsableAsCurrent: wearableCurrent,
    sleepUsableAsCurrent: wearableCurrent,
    rhrUsableAsCurrent: wearableCurrent,
    clarityUsableAsCurrent: checkInCurrent,
    wearableSourceAgeDays: age,
    maxWearableAgeDays: maxAge,
  };
}