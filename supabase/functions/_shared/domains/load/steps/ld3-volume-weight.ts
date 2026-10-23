// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step LD3, LD4 & LD5: Volume, Weight, and High-Stakes Anchors.
// Source: Part 2 Layer 2 (Section 4.5, LD3, LD4, LD5).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import type { HighStakesItemSummary } from "../types.ts";
import {
  HEAVY_VOLUME_MEETINGS,
  HEAVY_VOLUME_TIGHT_MEETINGS,
  HEAVY_VOLUME_AVG_GAP_MIN,
  STAKES_WEIGHT,
  HEAVY_WEIGHT_AVG,
  HEAVY_WEIGHT_HIGH_STAKES_COUNT,
  DECISION_HEAVY_MEETINGS,
} from "../constants.ts";

export interface VolumeWeightAnalysis {
  isLight: boolean;
  lightReason: string | null;
  isHeavyVolume: boolean;
  isHeavyWeight: boolean;
  isDecisionHeavy: boolean;
  highStakesAnchor: HighStakesItemSummary | null;
  highStakesItems: HighStakesItemSummary[];
  averageStakesWeight: number;
}

export function stepVolumeAndWeight(
  workMeetings: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
): VolumeWeightAnalysis {
  const highStakesItems: HighStakesItemSummary[] = [];
  let totalStakesWeight = 0;
  let decisionHeavyCount = 0;

  // Sort work meetings by start
  const sorted = [...workMeetings].sort((a, b) => {
    const sA = a.startUtc ? new Date(a.startUtc).getTime() : 0;
    const sB = b.startUtc ? new Date(b.startUtc).getTime() : 0;
    return sA - sB;
  });

  for (const m of sorted) {
    const stamp = stamps.find((s) => s.itemId === (m.externalId || m.identityKey));
    const cat = stamp?.category ?? "I";
    const stakes = stamp?.dimensions.stakes ?? "medium";

    // High stakes: category in {J, A, C, B} or stakes === "high"
    const isHighStakes = cat === "J" || cat === "A" || cat === "C" || cat === "B" || stakes === "high";

    if (isHighStakes) {
      highStakesItems.push({
        itemId: m.externalId || m.identityKey,
        title: m.title,
        category: cat,
        subtype: stamp?.subtype ?? null,
        stakes,
        startUtc: m.startUtc,
      });
    }

    const weight = STAKES_WEIGHT[stakes] ?? 2;
    totalStakesWeight += weight;

    if (stamp?.itemDemand?.demandProfile.cognitive && stamp.itemDemand.demandProfile.cognitive >= 2) {
      decisionHeavyCount++;
    }
  }

  const meetingCount = sorted.length;
  const avgWeight = meetingCount > 0 ? totalStakesWeight / meetingCount : 0;

  // Calculate average gap between consecutive meetings
  let avgGapMin = 999;
  if (meetingCount >= 2) {
    let totalGaps = 0;
    for (let i = 0; i < meetingCount - 1; i++) {
      const endMs = sorted[i].endUtc ? new Date(sorted[i].endUtc).getTime() : 0;
      const nextStartMs = sorted[i + 1].startUtc ? new Date(sorted[i + 1].startUtc).getTime() : 0;
      const gap = Math.max(0, Math.round((nextStartMs - endMs) / 60000));
      totalGaps += gap;
    }
    avgGapMin = totalGaps / (meetingCount - 1);
  }

  // Volume checks
  const isHeavyVolume =
    meetingCount >= HEAVY_VOLUME_MEETINGS ||
    (meetingCount >= HEAVY_VOLUME_TIGHT_MEETINGS && avgGapMin < HEAVY_VOLUME_AVG_GAP_MIN);

  // Weight checks
  const isHeavyWeight =
    (meetingCount > 0 && avgWeight >= HEAVY_WEIGHT_AVG) ||
    highStakesItems.length >= HEAVY_WEIGHT_HIGH_STAKES_COUNT;

  // Decision heavy checks
  const isDecisionHeavy = decisionHeavyCount >= DECISION_HEAVY_MEETINGS;

  // Light checks (LD3)
  let isLight = false;
  let lightReason: string | null = null;
  if (meetingCount === 0) {
    isLight = true;
    lightReason = "Open day with zero work meetings";
  } else if (meetingCount === 1 && highStakesItems.length === 0) {
    isLight = true;
    lightReason = "Single non-high-stakes meeting";
  }

  const highStakesAnchor = highStakesItems.length > 0 ? highStakesItems[0] : null;

  return {
    isLight,
    lightReason,
    isHeavyVolume,
    isHeavyWeight,
    isDecisionHeavy,
    highStakesAnchor,
    highStakesItems,
    averageStakesWeight: avgWeight,
  };
}
