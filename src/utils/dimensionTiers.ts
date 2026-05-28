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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

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
}

/**
 * @param baseline  ALL check-ins (last 90d) used to compute quartile cuts.
 * @param monthly   Check-ins inside the current calendar month — what we count.
 */
export function computeDimensionStreaks(
  baseline: MonthlyCheckin[],
  monthly: MonthlyCheckin[],
): { peaks: DimensionStreak[]; frictions: DimensionStreak[] } {
  const dims: Dimension[] = ['clarity', 'emotion', 'pressure', 'regulation'];
  const peaks: DimensionStreak[] = [];
  const frictions: DimensionStreak[] = [];

  for (const d of dims) {
    const key = `${d}_level` as keyof MonthlyCheckin;
    const base = baseline
      .map(c => c[key] as number | null | undefined)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    if (base.length < 6) continue; // not enough history to be honest

    // For inverted dims, "peak" means LOW values (bottom quartile of raw),
    // "friction" means HIGH values (top quartile of raw).
    const lo = quantile(base, 0.25);
    const hi = quantile(base, 0.75);
    const inverted = INVERTED[d];

    let peakCount = 0;
    let frictionCount = 0;
    for (const c of monthly) {
      const v = c[key] as number | null | undefined;
      if (typeof v !== 'number') continue;
      const isHigh = v >= hi;
      const isLow = v <= lo;
      if (inverted) {
        if (isLow) peakCount++;
        else if (isHigh) frictionCount++;
      } else {
        if (isHigh) peakCount++;
        else if (isLow) frictionCount++;
      }
    }

    if (peakCount >= 2) {
      peaks.push({ dimension: d, kind: 'peak', count: peakCount, label: DIMENSION_LABELS[d].peak });
    }
    if (frictionCount >= 2) {
      frictions.push({ dimension: d, kind: 'friction', count: frictionCount, label: DIMENSION_LABELS[d].friction });
    }
  }

  peaks.sort((a, b) => b.count - a.count);
  frictions.sort((a, b) => b.count - a.count);
  return { peaks: peaks.slice(0, 3), frictions: frictions.slice(0, 3) };
}