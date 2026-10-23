// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step SR1: Extract latest check-in for window/day and compute composite score.
// Source: Part 2 Layer 2 (Section 5.1.2, Step 1).

import type { CheckInReading } from "../types.ts";
import type { PhysiologyTier } from "../../physiology/types.ts";

export function stepExtractLatestCheckIn(checkIns: CheckInReading[]): {
  latest: CheckInReading | null;
  composite: number | null;
  selfReportedTier: PhysiologyTier | null;
} {
  if (!checkIns || checkIns.length === 0) {
    return { latest: null, composite: null, selfReportedTier: null };
  }

  // Sort by timestamp descending
  const sorted = [...checkIns].sort(
    (a, b) => new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime()
  );
  const latest = sorted[0];

  const scores: number[] = [];
  if (latest.emotionLevel != null) scores.push(latest.emotionLevel);
  if (latest.regulationLevel != null) scores.push(latest.regulationLevel);
  if (latest.clarityLevel != null) scores.push(latest.clarityLevel);
  if (latest.energyLevel != null) scores.push(latest.energyLevel);
  if (latest.pressureLevel != null) scores.push(latest.pressureLevel);

  if (scores.length === 0) {
    return { latest, composite: null, selfReportedTier: null };
  }

  const composite = scores.reduce((sum, v) => sum + v, 0) / scores.length;

  // Map 1–5 composite score to PhysiologyTier
  let selfReportedTier: PhysiologyTier = "steady";
  if (composite >= 4.5) selfReportedTier = "optimal";
  else if (composite >= 3.8) selfReportedTier = "primed";
  else if (composite >= 3.0) selfReportedTier = "steady";
  else if (composite >= 2.2) selfReportedTier = "managing";
  else if (composite >= 1.5) selfReportedTier = "depleted";
  else selfReportedTier = "overloaded";

  return { latest, composite, selfReportedTier };
}
