// MRS v2 — Calendar demand scorer.
//
// Phase C SSOT: this module owns every rule that used to live inside
// compute-outer-readiness/index.ts (`computeCalendarMetrics` +
// `inferRelationshipPressure`). The legacy inline versions have been
// deleted; all callers route through `computeCalendarDemand`. Behaviour is
// bit-equivalent to the legacy implementation — Phase E tests pin the
// matrix. Any divergence found there is a tuning task, not a quiet
// override.

import type { ClassifiedEventLite, DemandLevel, DemandScore } from './types.ts';

// ── Thresholds (verbatim from compute-outer-readiness §5.1) ──────────────
export const LOAD_HIGH_EVENT_COUNT = 4;          // 4+ events → high load
export const LOAD_MEDIUM_EVENT_COUNT = 3;        // 3 events → medium (or high if gap<20)
export const TIGHT_GAP_MINUTES = 20;
export const ORGANIZER_WEIGHT = 2;
export const LARGE_ATTENDEE_WEIGHT = 3;          // attendees > 5
export const SMALL_ATTENDEE_WEIGHT = 1;          // attendees > 2
export const NON_RECURRING_WEIGHT = 1;
export const TIGHT_TRANSITION_WEIGHT_MID = 2;    // 5m ≤ gap < 15m
export const TIGHT_TRANSITION_WEIGHT_HARD = 3;   // gap < 5m
export const DURATION_LONG_WEIGHT = 2;           // dur > 60m
export const DURATION_MED_WEIGHT = 1;            // 30 ≤ dur ≤ 60m
export const PEAK_HOUR_WEIGHT = 1;               // 9-12 or 14-16 local
export const DENSITY_BOOST = 3;                  // 3+ events AND total gap < 30m
export const PRESSURE_HIGH = 6;
export const PRESSURE_MEDIUM = 3;

/**
 * Relationship-pressure heuristic (was inline in compute-outer-readiness).
 * Matches title + metadata against a tiered regex set; declined-attendee
 * signal and large attendee count each contribute +1.
 */
export function inferRelationshipPressure(
  metadata: unknown,
  title: string,
  attendeeCount: number,
): number {
  const lower = `${title || ''} ${JSON.stringify(metadata || {})}`.toLowerCase();
  if (/(client|customer|vendor|supplier|partner|account|proposal|demo)/.test(lower)) return 2;
  if (/(boss|manager|director|vp|1:1|one-on-one|one on one|feedback|review|performance|skip level)/.test(lower)) return 2;
  if (/(direct report|mentee|coaching|onboarding|candidate|interview)/.test(lower)) return 1;
  if (/(team|sync|standup|working session|planning|retro)/.test(lower)) return 1;
  const sigs = (metadata as any)?.attendeeSignals?.attendees as any[] | undefined;
  if (Array.isArray(sigs) && sigs.some((a) => a?.responseStatus === 'declined')) return 1;
  if (attendeeCount >= 6) return 1;
  return 0;
}

/**
 * Compute calendar load + pressure + high-stakes + 0–100 composite for today.
 * Bit-equivalent to the legacy `computeCalendarMetrics` + relationship
 * pressure rules that previously lived inline in compute-outer-readiness.
 * Past events contribute half pressure; upcoming events contribute full.
 */
export function computeCalendarDemand(events: ClassifiedEventLite[]): DemandScore {
  if (!events || events.length === 0) {
    return { load: 'low', pressure: 'low', hasHighStakes: false, demandScore: 0 };
  }

  const now = Date.now();

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  // ── Gaps (raw, may be negative for overlaps; legacy parity) ──────────
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      (new Date(sorted[i].start_time).getTime() -
        new Date(sorted[i - 1].end_time).getTime()) /
        60000,
    );
  }
  const avgGap = gaps.length > 0
    ? gaps.reduce((s, g) => s + g, 0) / gaps.length
    : Infinity;
  const totalGapTime = gaps.length > 0
    ? gaps.reduce((s, g) => s + Math.max(0, g), 0)
    : Infinity;

  // ── Load ─────────────────────────────────────────────────────────────
  const count = sorted.length;
  let load: DemandLevel = 'low';
  if (count >= LOAD_HIGH_EVENT_COUNT) load = 'high';
  else if (count >= LOAD_MEDIUM_EVENT_COUNT && avgGap < TIGHT_GAP_MINUTES) load = 'high';
  else if (count >= LOAD_MEDIUM_EVENT_COUNT) load = 'medium';

  // ── Pressure ─────────────────────────────────────────────────────────
  let totalPressure = 0;
  for (const e of sorted) {
    let p = 0;
    if (e.is_organizer) p += ORGANIZER_WEIGHT;
    const att = e.attendees_count ?? 0;
    if (att > 5) p += LARGE_ATTENDEE_WEIGHT;
    else if (att > 2) p += SMALL_ATTENDEE_WEIGHT;
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    const dur = (end.getTime() - start.getTime()) / 60000;
    if (dur > 60) p += DURATION_LONG_WEIGHT;
    else if (dur >= 30) p += DURATION_MED_WEIGHT;
    if (!e.is_recurring) p += NON_RECURRING_WEIGHT;
    const hr = start.getHours();
    if ((hr >= 9 && hr < 12) || (hr >= 14 && hr < 16)) p += PEAK_HOUR_WEIGHT;
    p += inferRelationshipPressure(e.event_metadata ?? null, e.title || '', att);

    // Upcoming events full weight; past events half weight (ceil).
    if (start.getTime() >= now) totalPressure += p;
    else totalPressure += Math.ceil(p * 0.5);
  }

  // Back-to-back transitions (uses raw gaps so overlapping events also fire).
  for (const g of gaps) {
    if (g < 5) totalPressure += TIGHT_TRANSITION_WEIGHT_HARD;
    else if (g < 15) totalPressure += TIGHT_TRANSITION_WEIGHT_MID;
  }

  // Density boost: 3+ events with < 30m total positive gap time.
  if (count >= LOAD_MEDIUM_EVENT_COUNT && totalGapTime < 30) {
    totalPressure += DENSITY_BOOST;
  }

  // Intensity multiplier: >50% non-recurring AND organizer → ×1.5 (ceil).
  const intenseMeetings = sorted.filter((e) => !e.is_recurring && e.is_organizer).length;
  if (count > 0 && intenseMeetings / count > 0.5) {
    totalPressure = Math.ceil(totalPressure * 1.5);
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