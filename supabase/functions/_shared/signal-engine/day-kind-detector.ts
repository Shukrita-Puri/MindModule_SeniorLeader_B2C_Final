// MRS v2 §5.1 — Day-kind detector.
//
// Small pure helpers that classify a user's local time into the canonical
// time-window + day-context buckets used across the signal engine. Extracted
// from `compute-outer-readiness/index.ts` so other edge functions (smart
// nudges, mastery-plan generator, inner readiness) can derive the same
// labels without re-implementing the cutoffs.
//
// CONTRACT — never change without bumping the brief-prompt cache:
//   morning   05:00–11:59 local
//   afternoon 12:00–17:59 local
//   evening   18:00–04:59 local (wraps midnight)

export type TimeWindow = 'morning' | 'afternoon' | 'evening';
export type DayContext = 'weekday' | 'friday' | 'saturday' | 'sunday';

/** Returns a Date shifted into the user's local clock (UTC fields = local). */
export function getUserTime(timezoneOffset: number): Date {
  const now = new Date();
  return new Date(now.getTime() - timezoneOffset * 60000);
}

/** Canonical MRS v2 window mapping. */
export function getTimeOfDay(hour: number): TimeWindow {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Late-evening guard for wind-down framing (21:00 → 05:00 local). */
export function isLateEvening(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

/** Day-of-week bucket used for theme / nudge selection. */
export function getDayContext(dayOfWeek: number): DayContext {
  if (dayOfWeek === 5) return 'friday';
  if (dayOfWeek === 6) return 'saturday';
  if (dayOfWeek === 0) return 'sunday';
  return 'weekday';
}

/** Convenience: weekend = Sat or Sun. */
export function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}