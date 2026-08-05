// MRS v4 — independent EVENING physiological source.
//
// Why this exists: `eveningPhysioRead` carries 32.5 of the 100 evening points.
// Before this module it silently reused the MORNING HRV deviation, which was
// already scored at 8.75 via `hrvMorningDeviation` — one measurement driving
// 41.25 physiological points (double-count).
//
// This module derives a genuinely evening-window read from timestamped
// `hr_samples` (local 18:00–04:59) against the existing 30-day RHR baseline.
// No new gate: when no evening samples exist the cell is simply unavailable
// and §8.3 intra-pillar redistribution handles it.

export interface HrSample {
  t?: string | null;
  timestamp?: string | null;
  v?: number | null;
  value?: number | null;
  hour?: number | null;
}

export interface EveningPhysioSource {
  /** Mean evening HR as % deviation from the RHR baseline (positive = elevated). */
  eveningHrDeviationPct: number | null;
  /** true when evening mean HR sits >10% above the resting baseline. */
  bodyLoadElevated: boolean | null;
  sampleCount: number;
}

const EVENING_START_HOUR = 18;
const EVENING_END_HOUR = 5; // exclusive; 18:00–04:59 local

function sampleValue(s: HrSample): number | null {
  const raw = typeof s.v === 'number' ? s.v : typeof s.value === 'number' ? s.value : null;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function localHour(s: HrSample, offsetMinutes: number): number | null {
  if (typeof s.hour === 'number' && Number.isFinite(s.hour)) return s.hour;
  const iso = s.t ?? s.timestamp ?? null;
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + offsetMinutes * 60_000).getUTCHours();
}

function isEveningHour(hour: number): boolean {
  return hour >= EVENING_START_HOUR || hour < EVENING_END_HOUR;
}

/**
 * Derive an independent evening physiological read.
 *
 * @param samples          timestamped HR samples for the day
 * @param rhrBaseline      30-day resting HR baseline
 * @param offsetMinutes    local timezone offset in minutes (e.g. +60 for BST)
 */
export function deriveEveningPhysioSource(
  samples: unknown,
  rhrBaseline: number | null | undefined,
  offsetMinutes = 0,
): EveningPhysioSource {
  if (!Array.isArray(samples) || samples.length === 0) {
    return { eveningHrDeviationPct: null, bodyLoadElevated: null, sampleCount: 0 };
  }

  const values: number[] = [];
  for (const s of samples as HrSample[]) {
    if (!s || typeof s !== 'object') continue;
    const v = sampleValue(s);
    if (v == null) continue;
    const hour = localHour(s, offsetMinutes);
    if (hour == null || !isEveningHour(hour)) continue;
    values.push(v);
  }

  if (values.length === 0) {
    return { eveningHrDeviationPct: null, bodyLoadElevated: null, sampleCount: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  if (typeof rhrBaseline !== 'number' || !Number.isFinite(rhrBaseline) || rhrBaseline <= 0) {
    return { eveningHrDeviationPct: null, bodyLoadElevated: null, sampleCount: values.length };
  }

  const deviationPct = Math.round(((mean - rhrBaseline) / rhrBaseline) * 100);
  return {
    eveningHrDeviationPct: deviationPct,
    bodyLoadElevated: deviationPct > 10,
    sampleCount: values.length,
  };
}