// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Baseline calculations with strict exclusions.
// Source: Part 2 Layer 4 (Section 6, N-L4-5).

import type { History, HistoryDay, MetricId } from "../types.ts";

/**
 * Checks if a day is excluded from personal baseline calculations.
 * Excludes: travel days, illness, leave/vacation, crisis days, and unmeasured days (N-L4-5).
 */
export function isExcludedFromBaseline(day: HistoryDay): boolean {
  if (day.wearable?.isExcludedDay) return true;
  if (!day.dayProfile) return false;

  const dp = day.dayProfile;
  if (dp.travel?.isTravelling) return true;
  if (dp.crisis?.isCrisisDay) return true;
  if (!dp.availability?.isWorkingDay && dp.frame !== "workday") return true;

  return false;
}

/**
 * Computes a user's clean baseline value for a given metric across valid baseline days.
 */
export function computeOwnBaseline(
  history: History,
  metric: MetricId
): number | null {
  const values: number[] = [];

  for (const day of history.days) {
    if (isExcludedFromBaseline(day)) continue;

    const val = extractMetricValueFromDay(day, metric);
    if (val !== null && !isNaN(val)) {
      values.push(val);
    }
  }

  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Extracts a numeric metric value from a HistoryDay.
 */
export function extractMetricValueFromDay(
  day: HistoryDay,
  metric: MetricId
): number | null {
  if (metric === "hrv") return day.wearable?.hrv ?? null;
  if (metric === "rhr") return day.wearable?.rhr ?? null;
  if (metric === "deep_sleep") return day.wearable?.deepSleepMinutes ?? null;
  if (metric === "rem_sleep") return day.wearable?.remSleepMinutes ?? null;
  if (metric === "total_sleep") return day.wearable?.totalSleepMinutes ?? null;
  if (metric === "sleep_efficiency") return day.wearable?.sleepEfficiency ?? null;
  if (metric === "prs") return day.wearable?.readinessScore ?? null;

  // Subjective check-in metrics
  if (day.checkins && day.checkins.length > 0) {
    const valid = day.checkins
      .map((c) => {
        if (metric === "focus") return c.focus;
        if (metric === "energy") return c.energy;
        if (metric === "calm") return c.calm;
        if (metric === "clarity") return c.clarity;
        return null;
      })
      .filter((v): v is number => typeof v === "number" && !isNaN(v));

    if (valid.length > 0) {
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    }
  }

  return null;
}
