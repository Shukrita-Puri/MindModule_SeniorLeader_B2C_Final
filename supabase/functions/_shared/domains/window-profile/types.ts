// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Window Profile Composer.
// Source: Part 2 Layer 2 (Section 5.5).

import type { WindowExecutionMode, WindowName } from "../window-mode/types.ts";
import type { AnchorPhase } from "../phase/types.ts";
import type { RemainingFacts } from "../remaining/types.ts";
import type { HorizonsFacts } from "../horizons/types.ts";
import type { StateProfile } from "../state-profile/types.ts";
import type { DayProfileFacts } from "../day-profile/types.ts";

export interface ImmediateHorizonBundle {
  stateProfile: StateProfile;
  dayProfile: DayProfileFacts;
  freeMinutesRemaining: number;
}

export interface TacticalHorizonBundle {
  multiDayEffect?: string | null;
  recoveryHalfLifeHours?: number | null;
  sameWeekdayPattern?: string | null;
}

export interface StrategicHorizonBundle {
  activeGoals: string[];
  eveningGoalProgress?: string | null;
}

export interface WindowProfile {
  window: WindowName;
  mode: WindowExecutionMode;
  quietHoursStart: string;
  quietHoursActive: boolean;
  phase: AnchorPhase;
  postDemandingGap: boolean;
  minutesToNextHighStakes: number | null;
  remaining: RemainingFacts;
  horizons: HorizonsFacts;
  immediate?: ImmediateHorizonBundle | null;
  tactical?: TacticalHorizonBundle | null;
  strategic?: StrategicHorizonBundle | null;
  timestampUtc: string;
}
