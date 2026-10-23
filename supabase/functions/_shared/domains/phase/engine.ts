// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Phase Domain Engine.
// Evaluates phase relative to anchors (pre, during, post, clear) and protected post-demanding gaps.
// Source: Part 2 Layer 2 (Section 5.4, WN-04).

import {
  DEMANDING_ANCHOR_CATEGORIES,
  PRE_ANCHOR_WINDOW_MINUTES,
  PROTECTED_POST_GAP_MINUTES,
} from "./constants.ts";
import type { AnchorPhase, PhaseAnchorItem, PhaseFacts } from "./types.ts";

export interface PhaseEngineInput {
  anchors: PhaseAnchorItem[];
  nowUtc: Date;
}

export class PhaseEngine {
  public evaluate(input: PhaseEngineInput): PhaseFacts {
    const nowMs = input.nowUtc.getTime();

    // Sort chronologically
    const sorted = [...input.anchors].sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    );

    let activeAnchor: PhaseAnchorItem | null = null;
    let precedingAnchor: PhaseAnchorItem | null = null;
    let nextAnchor: PhaseAnchorItem | null = null;

    for (const item of sorted) {
      const startMs = new Date(item.startUtc).getTime();
      const endMs = new Date(item.endUtc).getTime();

      if (startMs <= nowMs && nowMs <= endMs) {
        activeAnchor = item;
      } else if (endMs < nowMs) {
        precedingAnchor = item; // Keep taking the latest preceding
      } else if (startMs > nowMs && !nextAnchor) {
        nextAnchor = item; // First upcoming
      }
    }

    // Minutes to next high-stakes item
    let minutesToNextHighStakes: number | null = null;
    const upcomingHighStakes = sorted.find((item) => {
      const startMs = new Date(item.startUtc).getTime();
      if (startMs <= nowMs) return false;
      return (
        (DEMANDING_ANCHOR_CATEGORIES as readonly string[]).includes(item.category) ||
        item.isHighStakes === true
      );
    });

    if (upcomingHighStakes) {
      const diffMs = new Date(upcomingHighStakes.startUtc).getTime() - nowMs;
      minutesToNextHighStakes = Math.max(0, Math.round(diffMs / 60000));
    }

    // 1. During anchor
    if (activeAnchor) {
      return {
        phase: "during_anchor",
        minutesToNextHighStakes,
        postDemandingGap: false,
        activeAnchor,
        nextAnchor,
        precedingAnchor,
      };
    }

    // 2. Check post-demanding gap (WN-04)
    let postDemandingGap = false;
    if (precedingAnchor) {
      const endMs = new Date(precedingAnchor.endUtc).getTime();
      const minsSinceEnd = Math.round((nowMs - endMs) / 60000);
      const isDemanding =
        (DEMANDING_ANCHOR_CATEGORIES as readonly string[]).includes(precedingAnchor.category) ||
        precedingAnchor.isHighStakes === true;

      if (minsSinceEnd >= 0 && minsSinceEnd <= PROTECTED_POST_GAP_MINUTES && isDemanding) {
        postDemandingGap = true;
      }
    }

    // 3. Determine Phase
    let phase: AnchorPhase = "clear";
    if (postDemandingGap) {
      phase = "post_anchor";
    } else if (nextAnchor) {
      const nextStartMs = new Date(nextAnchor.startUtc).getTime();
      const minsUntilNext = Math.round((nextStartMs - nowMs) / 60000);
      if (minsUntilNext <= PRE_ANCHOR_WINDOW_MINUTES) {
        phase = "pre_anchor";
      }
    }

    return {
      phase,
      minutesToNextHighStakes,
      postDemandingGap,
      activeAnchor: null,
      nextAnchor,
      precedingAnchor,
    };
  }
}

export const phaseEngine = new PhaseEngine();

export function evaluatePhase(input: PhaseEngineInput): PhaseFacts {
  return phaseEngine.evaluate(input);
}
