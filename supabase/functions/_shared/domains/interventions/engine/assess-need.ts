// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Step E2: Assess Need.
// Maps a situation / moment to one of the 15 canonical intervention needs.
// Source: Part 2 Layer 3 (Section 15.3).

import type { InterventionNeed } from "../types.ts";
import type { DayProfile } from "../../day-profile/types.ts";
import type { StateProfile } from "../../state-profile/types.ts";

export interface AssessNeedInput {
  anchorCategory?: string | null;
  phase: "pre" | "during" | "post" | "day" | "evening";
  slotRole?: "prepare" | "sustain" | "recover" | "wrap";
  dayProfile?: DayProfile | null;
  stateProfile?: StateProfile | null;
  isCrisis?: boolean;
}

export function assessNeed(input: AssessNeedInput): {
  need: InterventionNeed;
  reason: string;
} {
  // 1. Crisis takes precedence
  if (input.isCrisis || input.dayProfile?.crisis?.isCrisisDay) {
    return {
      need: "steady_in_crisis",
      reason: "Active crisis episode requires steadying and composure protection",
    };
  }

  // 2. Day off / leave
  if (input.dayProfile && input.dayProfile.availability && !input.dayProfile.availability.isWorkingDay) {
    if (input.dayProfile.weekAhead?.isActive) {
      return {
        need: "prepare_the_week",
        reason: "Last day off before returning to work; week ahead planning mode",
      };
    }
    return {
      need: "keep_the_ritual_off_days",
      reason: "Non-working day; maintain baseline daily recalibration habit",
    };
  }

  // 3. Evening wrap
  if (input.phase === "evening" || input.slotRole === "wrap") {
    if (input.dayProfile?.load.level === "heavy") {
      return {
        need: "protect_sleep_for_the_mind",
        reason: "Heavy day load; evening recovery required to protect sleep and tomorrow's capacity",
      };
    }
    return {
      need: "close_the_day",
      reason: "Evening slot; close open loops and wind down",
    };
  }

  // 4. During demanding item
  if (input.phase === "during") {
    return {
      need: "hold_steady_during",
      reason: "In-session anchor; internal composure and grounded focus during the meeting",
    };
  }

  // 5. Post demanding anchor
  if (input.phase === "post") {
    return {
      need: "offload_after",
      reason: "Post-peak slot; clear emotional residue and prevent hangover into next demands",
    };
  }

  // 6. Pre demanding anchor
  const cat = input.anchorCategory?.toUpperCase();
  if (input.phase === "pre" || input.slotRole === "prepare") {
    // If body strain is high
    const isBodyLoud =
      input.stateProfile?.tier === "depleted" ||
      input.stateProfile?.tier === "overloaded" ||
      input.stateProfile?.trajectory.hrDrift?.isDriftingUp;

    if (isBodyLoud || cat === "A" || cat === "B" || cat === "D" || cat === "J") {
      return {
        need: "settle_before",
        reason: `Demanding category ${cat ?? "A"} or elevated physical strain; settle arousal before entry`,
      };
    }

    if (cat === "C") {
      return {
        need: "prime_presence",
        reason: "Executive leadership item (Category C); prime presence and focused authority",
      };
    }

    if (cat === "E") {
      return {
        need: "clear_and_focus",
        reason: "Strategy or big decision block (Category E); clear distractions for deep focus",
      };
    }
  }

  // 7. Midday / Sustain slot
  if (input.slotRole === "sustain") {
    if (input.dayProfile?.contextualFacts.recoveryOwed) {
      return {
        need: "protect_recovery_window",
        reason: "Sustained load debt; protect midday recovery window to sustain second half of day",
      };
    }
    if (input.dayProfile?.mix.contextSwitching.level === "high") {
      return {
        need: "protect_attention",
        reason: "High context switching across multiple domains; shield attention boundaries",
      };
    }
    return {
      need: "transition_between",
      reason: "Midday transition between meetings; reset cognitive capacity",
    };
  }

  // Default fallback
  return {
    need: "settle_before",
    reason: "Standard recalibration before next commitment",
  };
}
