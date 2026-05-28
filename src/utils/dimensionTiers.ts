/**
 * Dimension quartile helper — shared between the Insights summary streaks
 * and the Performance Rhythm detail card so both speak the same "peak" /
 * "friction" language.
 *
 * Quartiles are computed from the user's OWN historical distribution for the
 * dimension (last 90 days, fallback to whatever exists) — not a fixed cut —
 * so the labels mean the same thing across users regardless of their
 * personal slider baseline.
 *
 * Pressure is inverted: low pressure_level = "composed" (peak),
 * high pressure_level = "overloaded" (friction).
 */

export type Dimension = 'clarity' | 'emotion' | 'pressure' | 'regulation';

export interface DimensionLabels {
  peak: string;
  friction: string;
}

export const DIMENSION_LABELS: Record<Dimension, DimensionLabels> = {
  clarity:    { peak: 'Peak Clarity',          friction: 'Clouded Clarity' },
  emotion:    { peak: 'Steady Emotion',        friction: 'Volatile Emotion' },
  pressure:   { peak: 'Composed Pressure',     friction: 'Overloaded Pressure' },
  regulation: { peak: 'In-Control Regulation', friction: 'Reactive Regulation' },
};

const INVERTED: Record<Dimension, boolean> = {
  clarity: false,
  emotion: false,
  pressure: true,
  regulation: false,
};

export interface DimensionStreak {
  dimension: Dimension;
  kind: 'peak' | 'friction';
  count: number;
  label: string;
}

export interface MonthlyCheckin {
  clarity_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;
  regulation_level?: number | null;
  checkin_date: string;
  created_at?: string | null;
}

/**
 * Monthly cumulative Peak / Friction counts (NOT a consecutive streak).
 *
 * For each dimension we count, across the current calendar month, how many
 * days had at least one check-in that met the band:
 *
 *   Peak (👍)    : any slot value ≥ 4   (top two levels — neutral excluded)
 *   Friction (👎): any slot value ≤ 2   (bottom two levels)
 *
 * A single day can contribute to BOTH peak and friction (e.g. morning 5,
 * evening 2) — peak and friction are independent monthly tallies.
 *
 * For pressure the raw 1–5 scale already encodes "1 = overloaded" / "5 =
 * spacious", so the same ≥4 / ≤2 rules apply directly.
 *
 * The tally resets on the 1st of the month (driven by the caller's query
 * window, e.g. `startOfMonth(now)`). This is intentionally different from
 * the consecutive-day flame on LevelTrendCalendar.
 *
 * @param baseline  kept for signature compatibility — unused.
 * @param monthly   Check-ins inside the current calendar month.
 */
export function computeDimensionStreaks(
  _baseline: MonthlyCheckin[],
  monthly: MonthlyCheckin[],
): { peaks: DimensionStreak[]; frictions: DimensionStreak[] } {
  const dims: Dimension[] = ['clarity', 'emotion', 'pressure', 'regulation'];
  const peaks: DimensionStreak[] = [];
  const frictions: DimensionStreak[] = [];

  // Group monthly check-ins by date.
  const byDate = new Map<string, MonthlyCheckin[]>();
  for (const c of monthly) {
    const arr = byDate.get(c.checkin_date) ?? [];
    arr.push(c);
    byDate.set(c.checkin_date, arr);
  }

  for (const d of dims) {
    const key = `${d}_level` as keyof MonthlyCheckin;
    let peakCount = 0;
    let frictionCount = 0;
    for (const rows of byDate.values()) {
      const vals = rows
        .map(r => r[key] as number | null | undefined)
        .filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) continue;
      if (vals.some(v => v >= 4)) peakCount += 1;
      if (vals.some(v => v <= 2)) frictionCount += 1;
    }
    peaks.push({ dimension: d, kind: 'peak', count: peakCount, label: DIMENSION_LABELS[d].peak });
    frictions.push({ dimension: d, kind: 'friction', count: frictionCount, label: DIMENSION_LABELS[d].friction });
  }

  return { peaks, frictions };
}

// Re-export so the (legacy) inverted map isn't accidentally tree-shaken if
// referenced elsewhere via type.
export { INVERTED };