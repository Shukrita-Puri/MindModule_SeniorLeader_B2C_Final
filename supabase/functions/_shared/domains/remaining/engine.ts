// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Remaining Domain Engine.
// Tracks completed vs remaining items, highest remaining stakes (including I and J), and decision leakage risk.
// Source: Part 2 Layer 2 (Section 5.4, WN-02, WN-03).

import {
  CANONICAL_STAKES_ORDER,
  DECISION_LEAKAGE_CATEGORIES,
  LEAKAGE_HR_ELEVATION_RATIO,
  REMAINING_B2B_GAP_THRESHOLD_MINS,
} from "./constants.ts";
import type { RemainingFacts, ScheduledMomentItem } from "./types.ts";

export interface RemainingEngineInput {
  items: ScheduledMomentItem[];
  nowUtc: Date;
  intradayHrBpm?: number | null;
  restingHrBaselineBpm?: number | null;
  hrDriftingUp?: boolean;
}

export class RemainingEngine {
  public evaluate(input: RemainingEngineInput): RemainingFacts {
    const nowMs = input.nowUtc.getTime();

    const completed: ScheduledMomentItem[] = [];
    const remaining: ScheduledMomentItem[] = [];

    for (const item of input.items) {
      const endMs = new Date(item.endUtc).getTime();
      if (endMs <= nowMs) {
        completed.push(item);
      } else {
        remaining.push(item);
      }
    }

    // Helper to find highest stakes category in a list
    const findHighestStakes = (list: ScheduledMomentItem[]): string | null => {
      let topCategory: string | null = null;
      let topRank = Infinity;

      for (const item of list) {
        const cat = item.category.toUpperCase();
        const rank = (CANONICAL_STAKES_ORDER as readonly string[]).indexOf(cat);
        if (rank !== -1 && rank < topRank) {
          topRank = rank;
          topCategory = cat;
        }
      }
      return topCategory;
    };

    const highestCompletedCategory = findHighestStakes(completed);
    const highestRemainingStakes = findHighestStakes(remaining); // WN-02

    // Sort remaining items chronologically to compute back-to-back chains and gaps
    remaining.sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    );

    let backToBackRemainingCount = 0;
    let openGapsMinutes = 0;

    for (let i = 0; i < remaining.length - 1; i++) {
      const currentEnd = new Date(remaining[i].endUtc).getTime();
      const nextStart = new Date(remaining[i + 1].startUtc).getTime();
      const gapMins = Math.max(0, Math.round((nextStart - currentEnd) / 60000));

      if (gapMins <= REMAINING_B2B_GAP_THRESHOLD_MINS) {
        backToBackRemainingCount++;
      } else {
        openGapsMinutes += gapMins;
      }
    }

    // Evaluate Decision Leakage Risk (WN-03)
    let decisionLeakageRisk = false;
    let leakageReason: string | null = null;

    const hasCriticalAhead = remaining.some((i) =>
      (DECISION_LEAKAGE_CATEGORIES as readonly string[]).includes(i.category.toUpperCase() as any)
    );

    let hrElevated = input.hrDriftingUp === true;
    if (
      !hrElevated &&
      input.intradayHrBpm != null &&
      input.restingHrBaselineBpm != null &&
      input.restingHrBaselineBpm > 0
    ) {
      const diffRatio =
        (input.intradayHrBpm - input.restingHrBaselineBpm) / input.restingHrBaselineBpm;
      if (diffRatio >= LEAKAGE_HR_ELEVATION_RATIO) {
        hrElevated = true;
      }
    }

    if (hasCriticalAhead && hrElevated) {
      decisionLeakageRisk = true;
      leakageReason =
        "Demanding decision/negotiation items (D/J) remain while heart rate is elevated >10% above baseline";
    }

    return {
      completedItemsCount: completed.length,
      remainingItemsCount: remaining.length,
      highestCompletedCategory,
      highestRemainingStakes,
      backToBackRemainingCount,
      openGapsMinutes,
      decisionLeakageRisk,
      leakageReason,
    };
  }
}

export const remainingEngine = new RemainingEngine();

export function evaluateRemaining(input: RemainingEngineInput): RemainingFacts {
  return remainingEngine.evaluate(input);
}
