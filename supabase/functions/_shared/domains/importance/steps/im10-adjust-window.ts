// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM10: Importance window adjustment.
// Re-ranks anchors with window readiness, adds state anchors, drops past items.
// Source: Part 2 Layer 2 (Section 5.3).

import type { ImportanceFacts, RankedAnchor } from "../types.ts";
import type { StateProfile } from "../../state-profile/types.ts";

export interface AdjustImportanceInput {
  base: ImportanceFacts;
  stateProfile: StateProfile;
  nowUtc: Date;
  recoveryOwed?: boolean;
  sustainedDeficit?: boolean;
}

export function stepAdjustImportanceForWindow(input: AdjustImportanceInput): ImportanceFacts {
  const nowMs = input.nowUtc.getTime();

  // 1. Drop anchors already past (IA-03)
  const activeAnchors: RankedAnchor[] = input.base.anchors.filter((anchor) => {
    if (!anchor.startUtc) return true; // Day anchors or timeless anchors stay
    const startMs = new Date(anchor.startUtc).getTime();
    return startMs >= nowMs; // Only keep current and future items
  });

  // 2. Add state anchors (IA-01, IA-02)
  const stateAnchors: RankedAnchor[] = [];

  // 2a. Readiness Demand Gap state anchor
  if (input.stateProfile.fit.hasGap && input.stateProfile.fit.readinessDemandGap) {
    const gap = input.stateProfile.fit.readinessDemandGap;
    stateAnchors.push({
      anchorId: "state_anchor_readiness_gap",
      kind: "state",
      title: `Readiness Gap · ${gap.summary}`,
      category: "D",
      totalScore: gap.size === "severe" ? 85 : 75,
      subScores: {
        stakes: 80,
        urgency: 85,
        tactical: 70,
        strategic: 60,
      },
      tier: "T3",
      isUserTagOverride: false,
      evidence: [
        {
          horizon: "immediate",
          sourceLayer: "L2 fit",
          fact: gap.summary,
          confidence: "high",
        },
      ],
    });
  }

  // 2b. Recovery Owed state anchor (IA-02)
  if (input.recoveryOwed) {
    stateAnchors.push({
      anchorId: "state_anchor_recovery_owed",
      kind: "state",
      title: "Recovery Owed · High prior load",
      category: "E",
      totalScore: 78,
      subScores: {
        stakes: 70,
        urgency: 80,
        tactical: 75,
        strategic: 50,
      },
      tier: "T2",
      isUserTagOverride: false,
      evidence: [
        {
          horizon: "immediate",
          sourceLayer: "L2 load",
          fact: "Prior load debt requires pacing/recovery window",
          confidence: "high",
        },
      ],
    });
  }

  // 2c. Sustained Deficit state anchor
  if (input.sustainedDeficit) {
    stateAnchors.push({
      anchorId: "state_anchor_sustained_deficit",
      kind: "state",
      title: "Sustained Deficit · Multi-day reserve depletion",
      category: "E",
      totalScore: 82,
      subScores: {
        stakes: 75,
        urgency: 85,
        tactical: 80,
        strategic: 50,
      },
      tier: "T3",
      isUserTagOverride: false,
      evidence: [
        {
          horizon: "tactical",
          sourceLayer: "L4 patterns",
          fact: "Sustained physiological deficit across multiple days",
          confidence: "high",
        },
      ],
    });
  }

  // 2d. Divergence confirmed by second signal
  if (
    input.stateProfile.agreement.hasDivergence &&
    input.stateProfile.agreement.divergence &&
    (input.stateProfile.fit.hasGap || input.sustainedDeficit)
  ) {
    stateAnchors.push({
      anchorId: "state_anchor_divergence",
      kind: "state",
      title: input.stateProfile.agreement.divergence.summary,
      totalScore: 70,
      subScores: {
        stakes: 65,
        urgency: 70,
        tactical: 70,
        strategic: 40,
      },
      tier: "T2",
      isUserTagOverride: false,
      evidence: [
        {
          horizon: "immediate",
          sourceLayer: "L2 agreement",
          fact: input.stateProfile.agreement.divergence.summary,
          confidence: "high",
        },
      ],
    });
  }

  // 3. Combine and re-rank
  const allAnchors = [...activeAnchors, ...stateAnchors].sort(
    (a, b) => b.totalScore - a.totalScore
  );

  const topItemAnchor = allAnchors.find((a) => a.kind === "item") ?? null;
  const topDayAnchor = allAnchors.find((a) => a.kind === "day") ?? null;

  return {
    mode: "adjusted",
    horizonHours: input.base.horizonHours,
    anchors: allAnchors,
    topItemAnchor,
    topDayAnchor,
    excluded: input.base.excluded,
  };
}
