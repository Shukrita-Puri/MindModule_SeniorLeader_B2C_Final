// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Horizons Domain Engine.
// Evaluates carry-in (morning look-back) and carry-out (evening look-ahead).
// Source: Part 2 Layer 2 (Section 5.4, WN-01, WN-05).

import {
  HIGH_STAKES_LOOKAHEAD_CATEGORIES,
  MIN_RECOVERY_SLEEP_MINUTES,
} from "./constants.ts";
import type { HighStakesAheadItem, HorizonsFacts, LookAheadFacts, LookBackFacts } from "./types.ts";

export interface TomorrowItemInput {
  id: string;
  title?: string;
  category: string;
  startTime: string;
  isHighStakes?: boolean;
}

export interface HorizonsEngineInput {
  // Look-back inputs (morning)
  yesterdayLivedLoad?: "heavy" | "moderate" | "light";
  yesterdayRanHeavierThanPlanned?: boolean;
  lastNightSleepMinutes?: number | null;
  explicitRecoveryOwed?: boolean;

  // Look-ahead inputs (evening)
  tomorrowPlannedLoad?: "heavy" | "moderate" | "light";
  tomorrowWeekAheadMode?: boolean;
  tomorrowItems?: TomorrowItemInput[];
}

export class HorizonsEngine {
  public evaluate(input: HorizonsEngineInput): HorizonsFacts {
    // 1. Look-back evaluation (WN-01)
    const livedLoad = input.yesterdayLivedLoad ?? "moderate";
    const heavierThanPlanned = input.yesterdayRanHeavierThanPlanned ?? false;
    const sleep = input.lastNightSleepMinutes ?? null;

    let recoveryOwed = input.explicitRecoveryOwed ?? false;
    if (heavierThanPlanned || livedLoad === "heavy") {
      recoveryOwed = true;
    }

    const lookBack: LookBackFacts = {
      yesterdayLivedLoad: livedLoad,
      yesterdayRanHeavierThanPlanned: heavierThanPlanned,
      lastNightSleepMinutes: sleep,
      recoveryOwed,
    };

    // 2. Look-ahead evaluation (WN-05)
    const plannedLoad = input.tomorrowPlannedLoad ?? "moderate";
    const weekAheadMode = input.tomorrowWeekAheadMode ?? false;

    let firstHighStakesItemTomorrow: HighStakesAheadItem | null = null;
    if (input.tomorrowItems && input.tomorrowItems.length > 0) {
      const sorted = [...input.tomorrowItems].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      const highStakes = sorted.find((item) =>
        (HIGH_STAKES_LOOKAHEAD_CATEGORIES as readonly string[]).includes(item.category.toUpperCase() as any) ||
        item.isHighStakes === true
      );

      if (highStakes) {
        firstHighStakesItemTomorrow = {
          id: highStakes.id,
          title: highStakes.title,
          category: highStakes.category.toUpperCase(),
          startTime: highStakes.startTime,
        };
      }
    }

    const lookAhead: LookAheadFacts = {
      tomorrowPlannedLoad: plannedLoad,
      tomorrowWeekAheadMode: weekAheadMode,
      firstHighStakesItemTomorrow,
    };

    return {
      lookBack,
      lookAhead,
    };
  }
}

export const horizonsEngine = new HorizonsEngine();

export function evaluateHorizons(input: HorizonsEngineInput): HorizonsFacts {
  return horizonsEngine.evaluate(input);
}
