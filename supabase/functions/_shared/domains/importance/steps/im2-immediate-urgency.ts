// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM2: Immediate Stakes (K) and Urgency (U).
// Source: Part 2 Layer 2 (Section 4.9, IM2, N-IM1).

import type { CandidateItem } from "./im1-candidates.ts";
import type { AnchorEvidence } from "../types.ts";
import {
  CATEGORY_BASE_SCORES,
  URGENCY_TAU_MINUTES,
  RELATIONSHIP_WEIGHT_CAP,
  D_BOOSTED_CAP,
} from "../constants.ts";

export interface ImmediateUrgencyScore {
  stakes: number; // K
  urgency: number; // U
  evidence: AnchorEvidence[];
}

export function stepImmediateAndUrgency(
  candidate: CandidateItem,
  nowUtc: Date,
  options?: { isLandingMeeting?: boolean; relationshipWeight?: number; upwardReporting?: boolean },
): ImmediateUrgencyScore {
  const cat = candidate.stamp.category ?? "I";
  const sub = candidate.stamp.subtype;
  const base = CATEGORY_BASE_SCORES[cat] ?? 8;
  const evidence: AnchorEvidence[] = [];

  let stakes = base;
  evidence.push({
    horizon: "immediate",
    sourceLayer: "L1 events",
    fact: `Category ${cat} base score`,
    measure: `${base} pts`,
    confidence: "high",
  });

  // Category D boosted cap
  if (cat === "D" && (sub === "lead.performance_review" || sub === "lead.difficult_conversation" || sub === "lead.layoff")) {
    stakes = Math.min(D_BOOSTED_CAP, stakes + 14);
    evidence.push({
      horizon: "immediate",
      sourceLayer: "L1 events",
      fact: `Sensitive leadership conversation (${sub})`,
      measure: "+14 pts",
      confidence: "high",
    });
  }

  // High stakes dimension boost (clears MIN_IMMEDIATE for strategic planning)
  if (candidate.stamp.dimensions.stakes === "high") {
    stakes += 15;
    evidence.push({
      horizon: "immediate",
      sourceLayer: "L1 events",
      fact: "High-stakes dimension confirmed",
      measure: "+15 pts",
      confidence: "high",
    });
  }

  // Upward reporting bonus (IM2)
  if (options?.upwardReporting) {
    stakes += 10;
    evidence.push({
      horizon: "immediate",
      sourceLayer: "L1 relationships",
      fact: "Upward reporting relationship",
      measure: "+10 pts",
      confidence: "high",
    });
  }

  // Relationship weight
  if (options?.relationshipWeight && options.relationshipWeight > 0) {
    const relPts = Math.min(RELATIONSHIP_WEIGHT_CAP, options.relationshipWeight);
    stakes += relPts;
    evidence.push({
      horizon: "immediate",
      sourceLayer: "L1 relationships",
      fact: "Relationship weight",
      measure: `+${relPts} pts`,
      confidence: "high",
    });
  }

  // Situation: landing meeting
  if (options?.isLandingMeeting) {
    stakes += 10;
    evidence.push({
      horizon: "immediate",
      sourceLayer: "L2 travel",
      fact: "Landing meeting within 3h of flight arrival",
      measure: "+10 pts",
      confidence: "high",
    });
  }

  // Calculate Urgency U = 100 * exp(-m / tau) (N-IM1)
  let urgency = 0;
  if (candidate.item.startUtc) {
    const sMs = new Date(candidate.item.startUtc).getTime();
    const eMs = candidate.item.endUtc ? new Date(candidate.item.endUtc).getTime() : sMs + 3600000;
    const nowMs = nowUtc.getTime();

    if (nowMs >= sMs && nowMs <= eMs) {
      urgency = 100; // in progress
    } else if (nowMs < sMs) {
      const minutesUntilStart = Math.max(0, (sMs - nowMs) / 60000);
      urgency = Math.round(100 * Math.exp(-minutesUntilStart / URGENCY_TAU_MINUTES));
    } else {
      urgency = 0; // already ended
    }
  }

  return {
    stakes: Math.min(100, stakes),
    urgency,
    evidence,
  };
}
