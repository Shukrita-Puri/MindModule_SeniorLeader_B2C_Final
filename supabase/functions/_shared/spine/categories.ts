// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Canonical A–J Event Categories.
// Source: A–J Event Classification: Final Design (Section 7.1) and Knowledge & Memory Spine (Section 11).
// Rule: Names and bucketKeys are immutable invariants across all features.

export type CategoryLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";

export interface CanonicalCategory {
  letter: CategoryLetter;
  name: string;
  bucketKey: string;
  description: string;
}

export const CANONICAL_CATEGORIES: Record<CategoryLetter, CanonicalCategory> = {
  A: {
    letter: "A",
    name: "Board & Governance",
    bucketKey: "board_governance",
    description: "Supervisory, fiduciary, shareholder, and formal governance assemblies.",
  },
  B: {
    letter: "B",
    name: "Pitches, Deals & Negotiations",
    bucketKey: "pitches_deals",
    description: "Commercial pitching, term sheet sign-offs, customer contracts, and investment discussions.",
  },
  C: {
    letter: "C",
    name: "Public Speaking & Media",
    bucketKey: "public_speaking_media",
    description: "External press, keynote delivery, podcast appearances, and broadcast media.",
  },
  D: {
    letter: "D",
    name: "People & Team Dynamics",
    bucketKey: "people_team",
    description: "Direct report 1:1s, talent performance reviews, skip-levels, and hiring committees.",
  },
  E: {
    letter: "E",
    name: "Strategic Thinking & Decision Making",
    bucketKey: "strategic_thinking",
    description: "Deep thinking, architectural decisions, strategy offsites, and executive peer forums.",
  },
  F: {
    letter: "F",
    name: "Conferences & External Events",
    bucketKey: "conferences_external",
    description: "Industry summits, symposiums, multi-day workshops, and external exhibitions.",
  },
  G: {
    letter: "G",
    name: "Travel",
    bucketKey: "travel",
    description: "Flights, rail transit, international relocation, and travel buffers.",
  },
  H: {
    letter: "H",
    name: "Personal Time & Recovery",
    bucketKey: "personal_recovery",
    description: "Protected personal space, family milestones, workouts, medical care, and fasting.",
  },
  I: {
    letter: "I",
    name: "Operations & Execution",
    bucketKey: "operations_execution",
    description: "Routine team standups, product delivery sprints, tactical syncs, and administrative work.",
  },
  J: {
    letter: "J",
    name: "Crisis, Risk & Incidents",
    bucketKey: "crisis_risk",
    description: "Live SEV-1 war rooms, emergency board sessions, regulatory escalations, and incident response.",
  },
} as const;

export const CATEGORY_LETTERS = Object.keys(CANONICAL_CATEGORIES) as CategoryLetter[];

export function getCategoryName(letter: CategoryLetter): string {
  return CANONICAL_CATEGORIES[letter]?.name ?? "Unresolved";
}

export function getCategoryBucketKey(letter: CategoryLetter): string {
  return CANONICAL_CATEGORIES[letter]?.bucketKey ?? "unknown";
}
