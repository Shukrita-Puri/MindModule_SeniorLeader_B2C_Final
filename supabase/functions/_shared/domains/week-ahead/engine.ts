// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Week-Ahead Domain Engine.
// Source: Part 2 Layer 2 (Section 4.8).

import type { WeekAheadFacts } from "./types.ts";
import { stepEvaluateWeekAheadMode, type WeekAheadEngineInput } from "./steps/wa-evaluate.ts";

export class WeekAheadEngine {
  /**
   * Evaluates whether the user lands in Week-Ahead Planning surface.
   */
  public evaluate(input: WeekAheadEngineInput): WeekAheadFacts {
    return stepEvaluateWeekAheadMode(input);
  }
}

export const weekAheadEngine = new WeekAheadEngine();
