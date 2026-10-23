// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step MX6: Context-Switching Level and Locations.
// Source: Part 2 Layer 2 (Section 4.6, MX6).

import type { ContextSwitchingFact, ContextSwitchItem, ContextSwitchingLevel } from "../types.ts";
import type { SequencedMeeting } from "./mx1-sequence.ts";
import { BACK_TO_BACK_GAP_MIN, SWITCH_HIGH, SWITCH_MEDIUM } from "../constants.ts";

export function stepContextSwitching(
  meetings: SequencedMeeting[],
  distinctCategoryCount: number,
): ContextSwitchingFact {
  const switches: ContextSwitchItem[] = [];

  for (let i = 1; i < meetings.length; i++) {
    const prev = meetings[i - 1];
    const curr = meetings[i];

    if (curr.category !== prev.category && curr.gapFromPreviousMin < BACK_TO_BACK_GAP_MIN) {
      const sDate = prev.item.startUtc ? prev.item.startUtc.slice(11, 16) : "";
      const eDate = curr.item.endUtc ? curr.item.endUtc.slice(11, 16) : "";
      switches.push({
        timeWindow: `${sDate}–${eDate}`,
        fromCategory: prev.category,
        toCategory: curr.category,
        gapMinutes: curr.gapFromPreviousMin,
      });
    }
  }

  let level: ContextSwitchingLevel = "low";
  if (switches.length >= SWITCH_HIGH) {
    level = "high";
  } else if (switches.length >= SWITCH_MEDIUM || distinctCategoryCount >= 3) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    level,
    switchCount: switches.length,
    switches,
  };
}
