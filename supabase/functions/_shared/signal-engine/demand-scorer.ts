// MRS v2 — Calendar demand scorer.
//
// Lifts the load / pressure thresholds from compute-outer-readiness/index.ts
// (the §5.1 calculation) into a shared module so inner readiness, the
// orchestrator, and outer readiness all derive demand identically. The exact
// thresholds match the legacy inline implementation — this is a refactor, not
// a tuning change.

import type { ClassifiedEventLite, DemandLevel, DemandScore } from './types.ts';

// ── Thresholds (verbatim from compute-outer-readiness §5.1) ──────────────
export const LOAD_HIGH_EVENT_COUNT = 4;          // 4+ events → high load
export const LOAD_MEDIUM_EVENT_COUNT = 3;        // 3 events → medium (or high if gap<20)
export const TIGHT_GAP_MINUTES = 20;
export const ORGANIZER_WEIGHT = 2;
export const LARGE_ATTENDEE_WEIGHT = 3;          // attendees > 5
export const SMALL_ATTENDEE_WEIGHT = 1;          // attendees > 2
export const NON_RECURRING_WEIGHT = 1;
export const TIGHT_TRANSITION_WEIGHT = 2;        // gap < 15m
export const PRESSURE_HIGH = 6;
export const PRESSURE_MEDIUM = 3;

/**
 * Compute calendar load + pressure + high-stakes for today.
 * Mirrors the legacy inline computeCalendarMetrics() in compute-outer-readiness
 * line ~188. Behavioural changes are forbidden here — only the surface moves.
 */
export function computeCalendarDemand(events: ClassifiedEventLite[]): DemandScore {
  if (!events || events.length === 0) {
    return { load: 'low', pressure: 'low', hasHighStakes: false, demandScore: 0 };
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  // ── Load ─────────────────────────────────────────────────────────────
  const count = sorted.length;
  let avgGap = Infinity;
  if (sorted.length > 1) {
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (new Date(sorted[i].start_time).getTime() -
          new Date(sorted[i - 1].end_time).getTime()) /
        60000;
      totalGap += Math.max(0, gap);
    }
    avgGap = totalGap / (sorted.length - 1);
  }

  let load: DemandLevel = 'low';
  if (count >= LOAD_HIGH_EVENT_COUNT) load = 'high';
  else if (count >= LOAD_MEDIUM_EVENT_COUNT && avgGap < TIGHT_GAP_MINUTES) load = 'high';
  else if (count >= LOAD_MEDIUM_EVENT_COUNT) load = 'medium';

  // ── Pressure ─────────────────────────────────────────────────────────
  let totalPressure = 0;
  let nonRecurringCount = 0;
  let organizerCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.is_organizer) {
      totalPressure += ORGANIZER_WEIGHT;
      organizerCount++;
    }
    if ((e.attendees_count ?? 0) > 5) totalPressure += LARGE_ATTENDEE_WEIGHT;
    else if ((e.attendees_count ?? 0) > 2) totalPressure += SMALL_ATTENDEE_WEIGHT;
    if (!e.is_recurring) {
      totalPressure += NON_RECURRING_WEIGHT;
      nonRecurringCount++;
    }
    if (i > 0) {
      const gap =
        (new Date(e.start_time).getTime() -
          new Date(sorted[i - 1].end_time).getTime()) /
        60000;
      if (gap < 15) totalPressure += TIGHT_TRANSITION_WEIGHT;
    }
  }

  // Intensity multiplier: >50% non-recurring AND organizer → 1.5×
  if (
    sorted.length > 0 &&
    nonRecurringCount / sorted.length > 0.5 &&
    organizerCount > 0
  ) {
    totalPressure = Math.round(totalPressure * 1.5);
  }

  let pressure: DemandLevel = 'low';
  if (totalPressure >= PRESSURE_HIGH) pressure = 'high';
  else if (totalPressure >= PRESSURE_MEDIUM) pressure = 'medium';

  // ── High-stakes detection ────────────────────────────────────────────
  // Same rule used by compute-outer-readiness highStakesEvents builder:
  // non-recurring AND (attendees > 5 OR (organizer AND attendees > 2)).
  const hasHighStakes = sorted.some(
    (e) =>
      !e.is_recurring &&
      ((e.attendees_count ?? 0) > 5 ||
        (e.is_organizer && (e.attendees_count ?? 0) > 2)),
  );

  // ── 0–100 composite ──────────────────────────────────────────────────
  // Load contributes 0/40/70 by tier; pressure contributes 0/15/25; high-stakes +10.
  const loadComponent = load === 'high' ? 70 : load === 'medium' ? 40 : 0;
  const pressureComponent = pressure === 'high' ? 25 : pressure === 'medium' ? 15 : 0;
  const stakesBonus = hasHighStakes ? 10 : 0;
  const demandScore = Math.max(0, Math.min(100, loadComponent + pressureComponent + stakesBonus));

  return { load, pressure, hasHighStakes, demandScore };
}

/** Map demandScore (0–100) onto the inner-readiness 20 / 50 / 80 band. */
export function demandToStateScore(demandScore: number): number {
  if (demandScore > 70) return 80;
  if (demandScore >= 40) return 50;
  return 20;
}