// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Step E4: Compose Day.
// Orchestrates the 3-slot daily intervention plan ensuring non-empty slots,
// app leadership (≤1 own action), and zero duplicates.
// Source: Part 2 Layer 3 (Section 15.5, CP1–CP6).

import { assessNeed } from "./assess-need.ts";
import { routeNeed } from "./route-need.ts";
import { selectIntervention } from "../selector/index.ts";
import { stepCheckCharter } from "./charter-check.ts";
import type {
  DayInterventionsPlan,
  PlanSlotRecommendation,
  PracticeDefinition,
  SelectionRequest,
} from "../types.ts";
import type { DayProfile } from "../../day-profile/types.ts";
import type { StateProfile } from "../../state-profile/types.ts";

export interface PlanSlotMomentInput {
  slotIndex: number; // 0, 1, 2
  role: "prepare" | "sustain" | "recover" | "wrap";
  anchorId?: string | null;
  anchorCategory?: string | null;
  phase: "pre" | "during" | "post" | "day" | "evening";
  availableGapMinutes: number;
}

export interface ComposeDayInput {
  moments: PlanSlotMomentInput[];
  dayProfile?: DayProfile | null;
  stateProfile?: StateProfile | null;
  catalogue?: PracticeDefinition[];
  userGoals?: string[];
  userFavourites?: string[];
  nowUtc?: Date;
}

export function composeDayInterventions(input: ComposeDayInput): DayInterventionsPlan {
  const slots: PlanSlotRecommendation[] = [];
  const chosenIdsToday: string[] = [];
  let ownActionAllocatedCount = 0;

  for (const moment of input.moments) {
    // 1. E2: Assess Need
    const { need } = assessNeed({
      anchorCategory: moment.anchorCategory,
      phase: moment.phase,
      slotRole: moment.role,
      dayProfile: input.dayProfile,
      stateProfile: input.stateProfile,
    });

    // 2. E3: Route Need (App First: at most 1 own action, CP3)
    const routing = routeNeed({
      need,
      availableGapMinutes: moment.availableGapMinutes,
      phase: moment.phase,
      isOwnActionSlotAllocated: ownActionAllocatedCount >= 1,
    });

    const allowOwnActions = routing.route === "own_action";

    // 3. Selection
    const request: SelectionRequest = {
      feature: "plan",
      slotId: `slot_${moment.slotIndex}`,
      anchorId: moment.anchorId,
      anchorCategory: moment.anchorCategory,
      phase: moment.phase,
      availableGapMinutes: moment.availableGapMinutes,
      targetNeed: need,
      userGoals: input.userGoals,
      userFavourites: input.userFavourites,
      priorCompletedIdsToday: chosenIdsToday,
    };

    const decision = selectIntervention({
      request,
      catalogue: input.catalogue,
      allowOwnActions,
      userStateTier: input.stateProfile?.tier,
      isBodyLoud: input.stateProfile?.trajectory.hrDrift?.isDriftingUp,
    });

    // 4. E5: Charter check
    stepCheckCharter(decision.chosen);

    // Track chosen to enforce CP5 (no repeats)
    chosenIdsToday.push(decision.chosen.id);

    if (decision.chosen.kind === "own_action") {
      ownActionAllocatedCount++;
    }

    slots.push({
      slotIndex: moment.slotIndex,
      role: moment.role,
      decision,
    });
  }

  const now = input.nowUtc ?? new Date();

  return {
    slots,
    hasOwnAction: ownActionAllocatedCount > 0,
    timestampUtc: now.toISOString(),
  };
}
