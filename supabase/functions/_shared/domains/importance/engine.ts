// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Importance Domain Engine (Base Ranking).
// Source: Part 2 Layer 2 (Section 4.9, 4.9.1).

import type { ImportanceFacts, RankedAnchor, AnchorEvidence } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import type { TravelFacts } from "../travel/types.ts";
import type { ConferenceFacts } from "../conference/types.ts";
import type { CrisisFacts } from "../crisis/types.ts";
import type { LoadFacts } from "../load/types.ts";
import { stepCollectCandidates } from "./steps/im1-candidates.ts";
import { stepImmediateAndUrgency } from "./steps/im2-immediate-urgency.ts";
import { stepTacticalScore, type TacticalInputData } from "./steps/im3-tactical.ts";
import { stepStrategicGoals } from "./steps/im4-strategic-goals.ts";
import { stepRankAnchors, type UnrankedAnchorInput } from "./steps/im8-rank.ts";
import { stepAdjustImportanceForWindow, type AdjustImportanceInput } from "./steps/im10-adjust-window.ts";
import { DEFAULT_HORIZON_HOURS } from "./constants.ts";

export interface ImportanceEngineInput {
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  travelFacts?: TravelFacts | null;
  conferenceFacts?: ConferenceFacts | null;
  crisisFacts?: CrisisFacts | null;
  loadFacts?: LoadFacts | null;
  userProtectionGoals?: string[];
  userPriorityItemIds?: string[];
  weekAheadChosenItemIds?: string[];
  weekAheadExcludedItemIds?: string[];
  tacticalDataByItemId?: Record<string, TacticalInputData>;
  horizonHours?: number;
  maturityTier?: "T0" | "T1" | "T2" | "T3";
  nowUtc?: Date;
}

export class ImportanceEngine {
  /**
   * Evaluates base importance ranking for item and day anchors across the specified horizon.
   */
  public evaluate(input: ImportanceEngineInput): ImportanceFacts {
    const now = input.nowUtc ?? new Date();
    const horizonHours = input.horizonHours ?? DEFAULT_HORIZON_HOURS;
    const tier = input.maturityTier ?? "T1";

    const { candidates, excluded } = stepCollectCandidates({
      items: input.items,
      stamps: input.stamps,
      userPriorityItemIds: input.userPriorityItemIds,
      weekAheadChosenItemIds: input.weekAheadChosenItemIds,
      weekAheadExcludedItemIds: input.weekAheadExcludedItemIds,
      horizonHours,
      nowUtc: now,
    });

    const unranked: UnrankedAnchorInput[] = [];

    // 1. Process Item Candidates
    for (const c of candidates) {
      const id = c.item.externalId || c.item.identityKey;
      const isLanding = Boolean(input.travelFacts?.landingMeeting && c.stamp.category === "A");

      const imm = stepImmediateAndUrgency(c, now, { isLandingMeeting: isLanding });
      const tacData = input.tacticalDataByItemId?.[id];
      const tac = stepTacticalScore(c, tacData);
      const str = stepStrategicGoals(c, imm.stakes, input.userProtectionGoals);

      const allEvidence: AnchorEvidence[] = [
        ...imm.evidence,
        ...tac.evidence,
        ...str.evidence,
      ];

      unranked.push({
        anchorId: id,
        kind: "item",
        title: c.item.title,
        category: c.stamp.category,
        subtype: c.stamp.subtype,
        startUtc: c.item.startUtc,
        stakes: imm.stakes,
        urgency: imm.urgency,
        tactical: tac.tactical,
        strategic: str.strategic,
        tier,
        isUserTagOverride: c.isUserTaggedImportant || c.isWeekAheadChoice,
        evidence: allEvidence,
      });
    }

    // 2. Add Day Anchors (travel day, conference day, crisis episode, working weekend)
    if (input.crisisFacts?.isCrisisDay) {
      unranked.push({
        anchorId: "day_anchor_crisis",
        kind: "day",
        title: "Crisis Episode",
        category: "J",
        stakes: 95,
        urgency: 90,
        tactical: 50,
        strategic: 50,
        tier,
        isUserTagOverride: true,
        evidence: [{
          horizon: "immediate",
          sourceLayer: "L2 crisis",
          fact: "Active crisis episode ongoing",
          confidence: "high",
        }],
      });
    }

    if (input.travelFacts?.isTravelling) {
      unranked.push({
        anchorId: "day_anchor_travel",
        kind: "day",
        title: "Travel Day",
        category: "G",
        stakes: 60,
        urgency: 70,
        tactical: 30,
        strategic: 20,
        tier,
        isUserTagOverride: false,
        evidence: [{
          horizon: "immediate",
          sourceLayer: "L2 travel",
          fact: "Confirmed/planned travel itinerary today",
          confidence: "high",
        }],
      });
    }

    if (input.loadFacts?.workOnNonWorkingDay?.isFullWorkingDay) {
      unranked.push({
        anchorId: "day_anchor_working_weekend",
        kind: "day",
        title: input.loadFacts.workOnNonWorkingDay.label,
        stakes: 55,
        urgency: 50,
        tactical: 40,
        strategic: 20,
        tier,
        isUserTagOverride: false,
        evidence: [{
          horizon: "immediate",
          sourceLayer: "L2 load",
          fact: `${input.loadFacts.workOnNonWorkingDay.label} active`,
          confidence: "high",
        }],
      });
    }

    const anchors = stepRankAnchors(unranked);

    const topItemAnchor = anchors.find((a) => a.kind === "item") ?? null;
    const topDayAnchor = anchors.find((a) => a.kind === "day") ?? null;

    return {
      mode: "base",
      horizonHours,
      anchors,
      topItemAnchor,
      topDayAnchor,
      excluded,
    };
  }

  /**
   * Adjusts base importance ranking for this window: drops past anchors,
   * adds state anchors (recovery owed, sustained deficit, readiness gap), and re-ranks.
   */
  public adjustForWindow(input: AdjustImportanceInput): ImportanceFacts {
    return stepAdjustImportanceForWindow(input);
  }
}

export const importanceEngine = new ImportanceEngine();

export function evaluateImportance(input: ImportanceEngineInput): ImportanceFacts {
  return importanceEngine.evaluate(input);
}

export function adjustImportanceForWindow(input: AdjustImportanceInput): ImportanceFacts {
  return importanceEngine.adjustForWindow(input);
}
