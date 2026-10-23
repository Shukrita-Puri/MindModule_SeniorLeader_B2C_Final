// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Fit Domain Engine.
// Evaluates whether the user's current physiological/refined state fits what the day still asks.
// Source: Part 2 Layer 2 (Section 5.1.4).

import type { PhysiologyTier } from "../physiology/types.ts";
import { GAP_TRIGGER_TIERS, HIGH_DEMAND_CATEGORIES } from "./constants.ts";
import type { FitFacts, ReadinessDemandGap, ScheduledDemandItem } from "./types.ts";

export interface FitEngineInput {
  refinedTier: PhysiologyTier;
  scheduledItems: ScheduledDemandItem[];
  nowUtc: Date;
  heavyStretchAhead?: boolean;
}

export class FitEngine {
  public evaluate(input: FitEngineInput): FitFacts {
    const isAtOrBelowManaging = (GAP_TRIGGER_TIERS as readonly string[]).includes(
      input.refinedTier
    );

    if (!isAtOrBelowManaging) {
      return {
        hasGap: false,
        readinessDemandGap: null,
      };
    }

    const nowMs = input.nowUtc.getTime();

    // Filter items remaining in the day that are demanding or high stakes
    const demandingAhead = input.scheduledItems.filter((item) => {
      const itemStartMs = new Date(item.startUtc).getTime();
      if (itemStartMs <= nowMs) return false;

      const isHighCat = (HIGH_DEMAND_CATEGORIES as readonly string[]).includes(item.category);
      return isHighCat || item.isHighStakes === true;
    });

    if (demandingAhead.length === 0 && !input.heavyStretchAhead) {
      return {
        hasGap: false,
        readinessDemandGap: null,
      };
    }

    // Sort by start time
    demandingAhead.sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    );

    const firstItem = demandingAhead[0];
    const minutesUntilFirst = firstItem
      ? Math.max(0, Math.round((new Date(firstItem.startUtc).getTime() - nowMs) / (1000 * 60)))
      : 0;

    const size = input.refinedTier === "managing" ? "moderate" : "severe";
    const itemNames = demandingAhead.map((i) => i.title || `Category ${i.category}`).join(", ");
    const summary = `State is ${input.refinedTier} with high-demand item${
      demandingAhead.length > 1 ? "s" : ""
    } ahead (${itemNames}) in ${minutesUntilFirst}m.`;

    const readinessDemandGap: ReadinessDemandGap = {
      size,
      itemsAhead: demandingAhead,
      minutesUntilFirst,
      summary,
    };

    return {
      hasGap: true,
      readinessDemandGap,
    };
  }
}

export const fitEngine = new FitEngine();

export function evaluateFit(input: FitEngineInput): FitFacts {
  return fitEngine.evaluate(input);
}
