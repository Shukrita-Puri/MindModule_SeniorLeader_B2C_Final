// MRS v2 §5.1 — Context builder helpers.
//
// Small pure predicates that translate raw signals into the "is this day
// meaningfully demanding?" and "is this sleep duration from an Apple source?"
// shape used by both readiness pills and nudges. Extracted from
// `compute-outer-readiness/index.ts` so other functions can reuse them.
//
// Cold-start tier helper centralises the §3.6 "establishing baseline" /
// "early reading" labels — pill payloads call this rather than re-deriving
// the day thresholds.

export type CalendarLevel = 'low' | 'medium' | 'high';

/** Apple sources report "time in bed", not asleep — needs ×0.85 correction. */
export function isAppleSleepSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return s === 'apple-healthkit' || s === 'apple_healthkit'
      || s === 'apple-watch'     || s === 'apple_watch';
}

/**
 * "Is there real demand on this day?" — used to decide whether a calendar-
 * aware brief variant is worth running. Mirrors the gate used inside the
 * readiness pills so dashboards and nudges agree.
 */
export function hasMeaningfulDemand(
  load: CalendarLevel | null,
  pressure: CalendarLevel | null,
  highStakes?: string[],
  meetingCount?: number,
): boolean {
  return Boolean(highStakes?.length)
    || load === 'high'
    || pressure === 'high'
    || (meetingCount ?? 0) >= 3;
}

/**
 * Cold-start tier label per MRS v2 §3.6. Returned alongside each pill so the
 * client can render "Establishing baseline" / "Early reading" without
 * re-deriving thresholds.
 *
 *   < 7 days of wearable data  → "establishing baseline"
 *   7–13 days                  → "early reading"
 *   ≥ 14 days                  → null (fully calibrated)
 *
 * Pills that don't depend on wearable data should pass `null` (no label).
 */
export type ColdStartLabel = 'establishing baseline' | 'early reading' | null;

export function coldStartLabel(daysOfWearableData: number | null | undefined): ColdStartLabel {
  const d = typeof daysOfWearableData === 'number' && Number.isFinite(daysOfWearableData)
    ? daysOfWearableData
    : 0;
  if (d < 7) return 'establishing baseline';
  if (d < 14) return 'early reading';
  return null;
}