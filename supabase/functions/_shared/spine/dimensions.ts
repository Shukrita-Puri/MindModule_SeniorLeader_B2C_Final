// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Canonical 10 Demand Dimensions.
// Source: A–J Event Classification: Final Design (Section 7.2) and Knowledge & Memory Spine (Section 11).

export type DemandDimensionKey =
  | "cognitive"
  | "emotional"
  | "visibility"
  | "political"
  | "relational"
  | "energy"
  | "circadian"
  | "identity"
  | "arousal"
  | "switchCost";

export interface DemandDimensionDefinition {
  key: DemandDimensionKey;
  shortKey: string;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
}

export const DEMAND_DIMENSIONS: Record<DemandDimensionKey, DemandDimensionDefinition> = {
  cognitive: {
    key: "cognitive",
    shortKey: "cog",
    name: "Cognitive Load",
    description: "Analytical depth, decision density, and problem-solving complexity.",
    minValue: 0,
    maxValue: 3,
  },
  emotional: {
    key: "emotional",
    shortKey: "emo",
    name: "Emotional Load",
    description: "Emotional labor, tension containment, conflict regulation, and empathy demand.",
    minValue: 0,
    maxValue: 3,
  },
  visibility: {
    key: "visibility",
    shortKey: "vis",
    name: "Public Visibility",
    description: "Audience size, stage presence, recording, scrutiny, and reputational exposure.",
    minValue: 0,
    maxValue: 3,
  },
  political: {
    key: "political",
    shortKey: "pol",
    name: "Political / Stakeholder Stakes",
    description: "Fiduciary accountability, power dynamics, governance, and alliance management.",
    minValue: 0,
    maxValue: 3,
  },
  relational: {
    key: "relational",
    shortKey: "rel",
    name: "Relational Demands",
    description: "Interpersonal friction, team alignment, mentoring, and 1:1 engagement.",
    minValue: 0,
    maxValue: 3,
  },
  energy: {
    key: "energy",
    shortKey: "ene",
    name: "Physical Energy Expenditure",
    description: "Sustained vocal output, standing, active facilitation, and physiological drain.",
    minValue: 0,
    maxValue: 3,
  },
  circadian: {
    key: "circadian",
    shortKey: "cir",
    name: "Circadian / Time-of-Day Disruption",
    description: "Early morning, late night, time zone transitions, or disruption to biological sleep rhythm.",
    minValue: 0,
    maxValue: 3,
  },
  identity: {
    key: "identity",
    shortKey: "id",
    name: "Identity / Ego Stake",
    description: "Personal performance evaluation, founder identity threat, and leadership role testing.",
    minValue: 0,
    maxValue: 3,
  },
  arousal: {
    key: "arousal",
    shortKey: "aro",
    name: "Sympathetic Arousal",
    description: "Acute adrenaline activation, fight-or-flight trigger, and pulse rate elevation.",
    minValue: 0,
    maxValue: 3,
  },
  switchCost: {
    key: "switchCost",
    shortKey: "swc",
    name: "Context Switching Cost",
    description: "Cognitive overhead of pivoting from an unrelated prior mode without sufficient buffer.",
    minValue: 0,
    maxValue: 3,
  },
} as const;

export type DemandVector = Record<DemandDimensionKey, number>;

export function createEmptyDemandVector(): DemandVector {
  return {
    cognitive: 0,
    emotional: 0,
    visibility: 0,
    political: 0,
    relational: 0,
    energy: 0,
    circadian: 0,
    identity: 0,
    arousal: 0,
    switchCost: 0,
  };
}
