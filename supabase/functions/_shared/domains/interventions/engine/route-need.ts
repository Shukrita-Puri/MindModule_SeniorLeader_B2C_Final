// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Step E3: Route Need.
// Determines whether a moment routes to an App Tool (Recalibrate) or an Executive Own-Action.
// Source: Part 2 Layer 3 (Section 15.4, RT1–RT6).

import type { InterventionNeed } from "../types.ts";
import { MIN_APP_PRACTICE_GAP_MINUTES } from "../constants.ts";

export type RoutingRule =
  | "RT1_structural_need"
  | "RT2_during_item"
  | "RT3_no_time_for_app"
  | "RT4_content_gap"
  | "RT5_proven_efficacy"
  | "RT6_app_first";

export interface BehaviourPatternInput {
  situation: string; // e.g. "travel", "evening", or Category A-J e.g. "category_a"
  isReliablySkipped: boolean;
  reason?: string;
}

export interface RouteNeedInput {
  need: InterventionNeed;
  availableGapMinutes: number;
  phase: "pre" | "during" | "post" | "day" | "evening";
  situation?: string;
  isOwnActionSlotAllocated?: boolean;
  behaviourPatterns?: BehaviourPatternInput[];
  preconditionFacts?: Record<string, boolean>;
}

export interface RoutingDecision {
  route: "app_tool" | "own_action";
  rule: RoutingRule;
  reason: string;
}

export function routeNeed(input: RouteNeedInput): RoutingDecision {
  // Rule CP3: At most one own action in a daily plan
  if (input.isOwnActionSlotAllocated) {
    return {
      route: "app_tool",
      rule: "RT6_app_first",
      reason: "App leads: own-action quota for the day already reached",
    };
  }

  // Layer 4 behaviour_patterns routing: an intervention reliably skipped in this situation routes to own_action (RT5)
  if (input.behaviourPatterns && input.behaviourPatterns.length > 0) {
    const skipPattern = input.behaviourPatterns.find(
      (p) =>
        p.isReliablySkipped &&
        (!input.situation ||
          p.situation.toLowerCase() === input.situation.toLowerCase() ||
          p.situation.toLowerCase() === input.phase.toLowerCase())
    );
    if (skipPattern) {
      return {
        route: "own_action",
        rule: "RT5_proven_efficacy",
        reason: `behaviour_pattern: app practice reliably skipped in ${skipPattern.situation}; own-action preferred`,
      };
    }
  }

  // RT2: Moment is inside an item -> Own action (app cannot be used during a meeting)
  if (input.phase === "during") {
    return {
      route: "own_action",
      rule: "RT2_during_item",
      reason: "In-session moment; the app cannot be used during a live meeting",
    };
  }

  // RT1: Structural need (protecting a calendar gap or attention boundary)
  if (input.need === "protect_recovery_window") {
    return {
      route: "own_action",
      rule: "RT1_structural_need",
      reason: "Structural calendar need; protect the time boundary directly",
    };
  }

  // RT3: Under 15 minutes free or setting where app cannot be used
  if (input.availableGapMinutes < MIN_APP_PRACTICE_GAP_MINUTES) {
    return {
      route: "own_action",
      rule: "RT3_no_time_for_app",
      reason: `Available time (${input.availableGapMinutes}m) is under 15m; own-action fits immediately`,
    };
  }

  // RT6: App First (Default priority)
  return {
    route: "app_tool",
    rule: "RT6_app_first",
    reason: "App leads; 15+ minutes available for guided Recalibrate practice",
  };
}
