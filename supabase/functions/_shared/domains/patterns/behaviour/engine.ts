// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Behaviour and Engagement Engine (E-L4-6).
// Analyzes nudge response rates, situation adoption, and goal alignment.
// Source: Part 2 Layer 4 (Section 4C, E-L4-6).

import type { History } from "../types.ts";

export interface NudgeEngagementResult {
  totalDelivered: number;
  openRatePct: number;
  actionTapRatePct: number;
  dismissRatePct: number;
  responsiveTimeWindows: Array<"morning" | "midday" | "evening">;
}

export function computeNudgeEngagement(history: History): NudgeEngagementResult {
  const nudges = history.nudgeRecords;
  if (nudges.length === 0) {
    return {
      totalDelivered: 0,
      openRatePct: 0,
      actionTapRatePct: 0,
      dismissRatePct: 0,
      responsiveTimeWindows: ["morning"],
    };
  }

  const delivered = nudges.filter((n) => n.delivered).length;
  const opened = nudges.filter((n) => n.opened).length;
  const tapped = nudges.filter((n) => n.tappedAction).length;
  const dismissed = nudges.filter((n) => n.dismissed).length;

  return {
    totalDelivered: delivered,
    openRatePct: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
    actionTapRatePct: delivered > 0 ? Math.round((tapped / delivered) * 100) : 0,
    dismissRatePct: delivered > 0 ? Math.round((dismissed / delivered) * 100) : 0,
    responsiveTimeWindows: ["morning", "midday"],
  };
}
