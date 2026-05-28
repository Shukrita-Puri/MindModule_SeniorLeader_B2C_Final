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
 * Flame-parity streak math.
 *
 * Mirrors the consecutive-day flame on the "When You Perform Best" trend
 * cards (LevelTrendCalendar): for each dimension we count consecutive
 * in-month days ending at today (or yesterday if today is not yet logged)
 * where ANY slot for that dimension hit the band.
 *
 *   Peak (👍)    : any slot value ≥ 4   (top two levels — neutral is NOT included)
 *   Friction (👎): any slot value ≤ 2   (bottom two levels)
 *
 * For pressure the raw 1–5 scale already encodes "1 = overloaded" / "5 =
 * spacious", so the same ≥4 / ≤2 rules apply directly — the INVERTED flag
 * only matters for the legacy quartile path, which we no longer use.
 *
 * The streak resets on the 1st of the month and on any in-month day that
 * had a check-in but did not meet the band.
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
  const datesAsc = Array.from(byDate.keys()).sort();
  const todayStr = new Date().toLocaleDateString('en-CA');

  for (const d of dims) {
    const key = `${d}_level` as keyof MonthlyCheckin;

    // Walk from the most-recent in-month date backwards, but skip today if
 // today has no check-in yet (matches LevelTrendCalendar behaviour).
    let i = datesAsc.length - 1;
    if (i >= 0 && datesAsc[i] === todayStr) {
      const todayRows = byDate.get(datesAsc[i]) ?? [];
      const hasAny = todayRows.some(r => typeof r[key] === 'number');
      if (!hasAny) i -= 1;
    }

    const dayMatches = (rows: MonthlyCheckin[], predicate: (v: number) => boolean): 'hit' | 'miss' | 'empty' => {
      const vals = rows
        .map(r => r[key] as number | null | undefined)
        .filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return 'empty';
      return vals.some(predicate) ? 'hit' : 'miss';
    };

    let peakCount = 0;
    for (let j = i; j >= 0; j--) {
      const rows = byDate.get(datesAsc[j]) ?? [];
      const r = dayMatches(rows, v => v >= 4);
      if (r === 'hit') peakCount += 1;
      else if (r === 'miss') break;
      // 'empty' days are skipped (no check-in that day for this dim) —
      // they don't extend or break the streak.
    }

    let frictionCount = 0;
    for (let j = i; j >= 0; j--) {
      const rows = byDate.get(datesAsc[j]) ?? [];
      const r = dayMatches(rows, v => v <= 2);
      if (r === 'hit') frictionCount += 1;
      else if (r === 'miss') break;
    }

    peaks.push({ dimension: d, kind: 'peak', count: peakCount, label: DIMENSION_LABELS[d].peak });
    frictions.push({ dimension: d, kind: 'friction', count: frictionCount, label: DIMENSION_LABELS[d].friction });
  }

  return { peaks, frictions };
}

// Re-export so the (legacy) inverted map isn't accidentally tree-shaken if
// referenced elsewhere via type.
export { INVERTED };