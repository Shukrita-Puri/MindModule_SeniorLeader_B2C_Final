// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Crisis Episode Domain Engine.
// Source: Part 2 Layer 2 (Section 4.7).

import type { CrisisFacts, CrisisEpisode } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepCrisisItemSignals } from "./steps/cr1-signals.ts";
import { stepEvaluateCrisisEpisode } from "./steps/cr4-open.ts";

export interface CrisisEngineInput {
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  isFirstSync?: boolean;
  hasDisplacedRoutineMeetings?: boolean;
  existingEpisode?: CrisisEpisode | null;
  nowUtc?: Date;
}

export class CrisisEngine {
  /**
   * Evaluates urgent crisis episodes and emits active crisis status for Day Profile overlay.
   */
  public evaluate(input: CrisisEngineInput): CrisisFacts {
    const signals = stepCrisisItemSignals(
      input.items,
      input.stamps,
      input.isFirstSync ?? false,
      input.nowUtc ?? new Date(),
    );

    const episode = stepEvaluateCrisisEpisode({
      signals,
      hasDisplacedRoutineMeetings: input.hasDisplacedRoutineMeetings,
      existingEpisode: input.existingEpisode,
      nowUtc: input.nowUtc,
    });

    const isCrisisDay = Boolean(episode && (episode.state === "open" || episode.state === "confirmed"));

    return {
      isCrisisDay,
      crisisEpisodeActive: isCrisisDay,
      activeEpisode: episode,
      reasons: episode ? episode.reasons : [],
    };
  }
}

export const crisisEngine = new CrisisEngine();
