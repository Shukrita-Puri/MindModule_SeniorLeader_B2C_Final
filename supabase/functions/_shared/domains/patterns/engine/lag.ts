// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Lag resolution for pattern evaluation.
// Source: Part 2 Layer 4 (Section 6, N-L4-3).

import type { ExposureEvent, History, LagType, MetricId } from "../types.ts";
import { extractMetricValueFromDay } from "./baselines.ts";

/**
 * Finds the HistoryDay corresponding to date + offsetDays.
 */
function findDayOffset(
  history: History,
  baseDate: string,
  offsetDays: number
) {
  const base = new Date(`${baseDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const targetDateStr = base.toISOString().slice(0, 10);

  return history.days.find((d) => d.date === targetDateStr) ?? null;
}

/**
 * Resolves the relevant metric measurement for an exposure event under a given LagType.
 * Next-morning recovery patterns read day + 1 overnight sleep / morning metrics (N-L4-3).
 */
export function resolveLagValue(
  exposure: ExposureEvent,
  history: History,
  metric: MetricId,
  lag: LagType
): number | null {
  if (lag === "same_day") {
    const day = history.days.find((d) => d.date === exposure.date);
    return day ? extractMetricValueFromDay(day, metric) : null;
  }

  if (lag === "next_morning" || lag === "next_day") {
    // Next morning's measurement (e.g. sleep or HRV after a demanding event day)
    const nextDay = findDayOffset(history, exposure.date, 1);
    return nextDay ? extractMetricValueFromDay(nextDay, metric) : null;
  }

  if (lag === "multi_day") {
    const values: number[] = [];
    for (let offset = 1; offset <= 3; offset++) {
      const d = findDayOffset(history, exposure.date, offset);
      if (d) {
        const v = extractMetricValueFromDay(d, metric);
        if (v !== null) values.push(v);
      }
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return null;
}
