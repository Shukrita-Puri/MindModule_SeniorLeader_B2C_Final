// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Trends Engine (E-L4-4).
// Computes 3-day MRS trend, weekly delta %, cumulative deficit, and burnout risk.
// Source: Part 2 Layer 4 (Section 4C, P10).

import type { History, TrendResult } from "../types.ts";

export function computeTrends(history: History): TrendResult {
  const wearables = [...history.wearables]
    .filter((w) => typeof w.readinessScore === "number")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (wearables.length === 0) {
    return {
      mrs3DayTrend: "steady",
      mrsWeeklyDeltaPct: 0,
      deficitDaysCount: 0,
      burnoutRiskLevel: "low",
      daysSinceLastRestoration: 0,
    };
  }

  // 1. 3-day trend
  const recent3 = wearables.slice(-3);
  let mrs3DayTrend: "rising" | "falling" | "steady" = "steady";
  if (recent3.length === 3) {
    const d1 = recent3[0].readinessScore!;
    const d3 = recent3[2].readinessScore!;
    if (d3 - d1 >= 5) mrs3DayTrend = "rising";
    else if (d1 - d3 >= 5) mrs3DayTrend = "falling";
  }

  // 2. Weekly delta (this week avg vs last week avg)
  const thisWeek = wearables.slice(-7);
  const lastWeek = wearables.slice(-14, -7);
  let mrsWeeklyDeltaPct = 0;
  if (thisWeek.length >= 3 && lastWeek.length >= 3) {
    const avgThis =
      thisWeek.reduce((s, w) => s + w.readinessScore!, 0) / thisWeek.length;
    const avgLast =
      lastWeek.reduce((s, w) => s + w.readinessScore!, 0) / lastWeek.length;
    if (avgLast > 0) {
      mrsWeeklyDeltaPct = Math.round(((avgThis - avgLast) / avgLast) * 100);
    }
  }

  // 3. Deficit count (days where readiness < 60)
  const deficitDaysCount = wearables.slice(-7).filter(
    (w) => (w.readinessScore ?? 100) < 60
  ).length;

  // 4. Burnout risk level
  let burnoutRiskLevel: "low" | "moderate" | "elevated" | "high" = "low";
  if (deficitDaysCount >= 5) burnoutRiskLevel = "high";
  else if (deficitDaysCount >= 3) burnoutRiskLevel = "elevated";
  else if (deficitDaysCount >= 2) burnoutRiskLevel = "moderate";

  // 5. Days since last restoration (day with readiness >= 75)
  let daysSinceLastRestoration = 0;
  for (let i = wearables.length - 1; i >= 0; i--) {
    if ((wearables[i].readinessScore ?? 0) >= 75) {
      break;
    }
    daysSinceLastRestoration++;
  }

  return {
    mrs3DayTrend,
    mrsWeeklyDeltaPct,
    deficitDaysCount,
    burnoutRiskLevel,
    daysSinceLastRestoration,
  };
}
