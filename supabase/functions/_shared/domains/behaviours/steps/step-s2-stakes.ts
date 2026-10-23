// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S2: Evaluate Stakes Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateStakesSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];

  const dayProfile = bundle.dayProfile;
  const windowProfile = bundle.windowProfile;
  const contextual = dayProfile?.contextualFacts;
  const minsToNextHighStakes = windowProfile?.minutesToNextHighStakes;

  // 1. prepWindowOpen (near band 4h = 240 min)
  if (minsToNextHighStakes != null && minsToNextHighStakes <= 1440 && minsToNextHighStakes > 0) {
    const isNearBand = minsToNextHighStakes <= 240;
    signals.push({
      name: "prepWindowOpen",
      severity: isNearBand ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.prepWindowOpen,
      evidencePointers: [`L2 importance anchor ahead in ${minsToNextHighStakes}m`],
      reason: `Advance preparation window open for upcoming high-stakes anchor in ${minsToNextHighStakes}m`,
    });
  }

  // 2. boardLevelOutcome (CEO pack: Category A within 240m)
  const topAnchor = bundle.importance?.topItemAnchor;
  if (topAnchor?.category?.toUpperCase() === "A" && minsToNextHighStakes != null && minsToNextHighStakes <= 240) {
    signals.push({
      name: "boardLevelOutcome",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.boardLevelOutcome,
      evidencePointers: [`L1 Category A anchor (${topAnchor.title}) in ${minsToNextHighStakes}m`],
      reason: "Board-level governance meeting approaching; critical outcome stakes",
    });
  }

  // 3. postGovernanceOffload (Category A item just ended, phase post)
  if (windowProfile?.phase === "post_anchor" && windowProfile?.postDemandingGap) {
    signals.push({
      name: "postGovernanceOffload",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.postGovernanceOffload,
      evidencePointers: ["L2 window phase: post_anchor with protected gap"],
      reason: "Governance/demanding item concluded; offload post-peak residue",
    });
  }

  // 4. upwardReporting
  if (contextual?.upwardReporting) {
    signals.push({
      name: "upwardReporting",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.upwardReporting,
      evidencePointers: ["L1 relationship context: upward reporting to board/investors"],
      reason: "Meeting with senior upward stakeholders (chair, board, investors)",
    });
  }

  // 5. dualEmotionalStakes
  if (contextual?.dualEmotionalStakes) {
    signals.push({
      name: "dualEmotionalStakes",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.dualEmotionalStakes,
      evidencePointers: ["L2 day profile: dual emotional stakes flag active"],
      reason: "Day carries dual opposing emotional demands (e.g. negotiation + celebratory dinner)",
    });
  }

  // 6. stackedStakes
  if (contextual?.stackedStakes) {
    signals.push({
      name: "stackedStakes",
      severity: minsToNextHighStakes != null && minsToNextHighStakes <= 90 ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.stackedStakes,
      evidencePointers: ["L2 day profile: stacked stakes active"],
      reason: "Multiple consecutive high stakes meetings clustered closely",
    });
  }

  // 7. stakesBuildUp
  if (contextual?.stakesBuildUp) {
    signals.push({
      name: "stakesBuildUp",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.stakesBuildUp,
      evidencePointers: ["L4 pattern: multi-day stakes build up"],
      reason: "Cumulative stakes building toward peak event",
    });
  }

  return signals;
}
