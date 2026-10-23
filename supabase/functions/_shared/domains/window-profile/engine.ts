// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Window Profile Domain Engine.
// Evaluates the 4 window engines and composes the canonical WindowProfile.
// Source: Part 2 Layer 2 (Section 5.5).

import { evaluateWindowMode, type WindowModeEngineInput } from "../window-mode/index.ts";
import { evaluatePhase, type PhaseAnchorItem } from "../phase/index.ts";
import { evaluateRemaining, type ScheduledMomentItem } from "../remaining/index.ts";
import { evaluateHorizons, type HorizonsEngineInput } from "../horizons/index.ts";
import { composeWindowProfile } from "./composer.ts";
import type {
  StrategicHorizonBundle,
  TacticalHorizonBundle,
  WindowProfile,
} from "./types.ts";
import type { StateProfile } from "../state-profile/types.ts";
import type { DayProfileFacts } from "../day-profile/types.ts";

export interface WindowProfileEngineInput {
  modeInput: WindowModeEngineInput;
  items: ScheduledMomentItem[];
  anchors?: PhaseAnchorItem[];
  horizonsInput?: HorizonsEngineInput;
  stateProfile?: StateProfile | null;
  dayProfile?: DayProfileFacts | null;
  tacticalPatterns?: TacticalHorizonBundle | null;
  strategicGoals?: StrategicHorizonBundle | null;
  intradayHrBpm?: number | null;
  restingHrBaselineBpm?: number | null;
  hrDriftingUp?: boolean;
  nowUtc?: Date;
}

export class WindowProfileEngine {
  public evaluate(input: WindowProfileEngineInput): WindowProfile {
    const now = input.nowUtc ?? new Date();

    // 1. Window Mode
    const windowMode = evaluateWindowMode(input.modeInput);

    // 2. Phase
    const phaseAnchors: PhaseAnchorItem[] =
      input.anchors ??
      input.items.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        startUtc: i.startUtc,
        endUtc: i.endUtc,
      }));
    const phase = evaluatePhase({
      anchors: phaseAnchors,
      nowUtc: now,
    });

    // 3. Remaining
    const remaining = evaluateRemaining({
      items: input.items,
      nowUtc: now,
      intradayHrBpm: input.intradayHrBpm,
      restingHrBaselineBpm: input.restingHrBaselineBpm,
      hrDriftingUp: input.hrDriftingUp,
    });

    // 4. Horizons
    const horizons = evaluateHorizons(input.horizonsInput ?? {});

    // 5. Compose Window Profile
    return composeWindowProfile({
      windowMode,
      phase,
      remaining,
      horizons,
      stateProfile: input.stateProfile,
      dayProfile: input.dayProfile,
      tacticalPatterns: input.tacticalPatterns,
      strategicGoals: input.strategicGoals,
      nowUtc: now,
    });
  }
}

export const windowProfileEngine = new WindowProfileEngine();

export function evaluateWindowProfile(input: WindowProfileEngineInput): WindowProfile {
  return windowProfileEngine.evaluate(input);
}
