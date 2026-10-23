// [KIND: composer] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Window Profile Composer.
// Source: Part 2 Layer 2 (Section 5.5).

import type { WindowModeFacts } from "../window-mode/types.ts";
import type { PhaseFacts } from "../phase/types.ts";
import type { RemainingFacts } from "../remaining/types.ts";
import type { HorizonsFacts } from "../horizons/types.ts";
import type { StateProfile } from "../state-profile/types.ts";
import type { DayProfileFacts } from "../day-profile/types.ts";
import type {
  ImmediateHorizonBundle,
  StrategicHorizonBundle,
  TacticalHorizonBundle,
  WindowProfile,
} from "./types.ts";

export interface ComposeWindowProfileInput {
  windowMode: WindowModeFacts;
  phase: PhaseFacts;
  remaining: RemainingFacts;
  horizons: HorizonsFacts;
  stateProfile?: StateProfile | null;
  dayProfile?: DayProfileFacts | null;
  tacticalPatterns?: TacticalHorizonBundle | null;
  strategicGoals?: StrategicHorizonBundle | null;
  nowUtc?: Date;
}

export function composeWindowProfile(input: ComposeWindowProfileInput): WindowProfile {
  const now = input.nowUtc ?? new Date();

  let immediate: ImmediateHorizonBundle | null = null;
  if (input.stateProfile && input.dayProfile) {
    immediate = {
      stateProfile: input.stateProfile,
      dayProfile: input.dayProfile,
      freeMinutesRemaining: input.remaining.openGapsMinutes,
    };
  }

  return {
    window: input.windowMode.window,
    mode: input.windowMode.mode,
    quietHoursStart: input.windowMode.quietHoursStart,
    quietHoursActive: input.windowMode.quietHoursActive,
    phase: input.phase.phase,
    postDemandingGap: input.phase.postDemandingGap,
    minutesToNextHighStakes: input.phase.minutesToNextHighStakes,
    remaining: input.remaining,
    horizons: input.horizons,
    immediate,
    tactical: input.tacticalPatterns ?? null,
    strategic: input.strategicGoals ?? null,
    timestampUtc: now.toISOString(),
  };
}
