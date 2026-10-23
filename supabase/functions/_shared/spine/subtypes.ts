// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Canonical 56 Event Subtypes.
// Source: A–J Event Classification: Final Design (Section 7) and Spine Section 11.

import type { CategoryLetter } from "./categories.ts";

export interface CanonicalSubtype {
  id: string;
  categoryId: CategoryLetter;
  name: string;
  description: string;
  jitLeadTimeMinutes: number;
}

export const CANONICAL_SUBTYPE_IDS = [
  // A: Board & Governance
  "gov.trustee",
  "gov.board_meeting",
  "gov.board_committee",
  "gov.board_prep",
  "gov.nonexec_board",
  "gov.investor_meeting",
  "gov.earnings_call",
  "gov.qbr",
  "gov.budget_review",
  "gov.ma_discussion",
  "gov.crisis",

  // B: Pitches, Deals & Negotiations
  "inf.pitch_competitive",
  "inf.fundraising",
  "inf.negotiation",
  "inf.client_presentation",

  // C: Public Speaking & Media
  "vis.roundtable",
  "vis.stakeholder_comm",
  "vis.media",
  "vis.all_hands",

  // D: People & Team Dynamics
  "lead.executive_1on1",
  "lead.leadership_sync",
  "lead.performance_review",
  "lead.difficult_conversation",
  "lead.layoff",
  "lead.hiring_interview",
  "lead.hiring_committee",

  // E: Strategic Thinking & Decision Making
  "str.learning",
  "str.community",
  "str.review",
  "str.compliance",
  "str.strategy_planning",
  "str.deep_work",
  "str.product_launch",

  // F: Conferences & External Events
  "conf.keynote",
  "conf.speaking",
  "conf.offsite",
  "conf.award",
  "conf.customer_summit",
  "conf.networking",
  "conf.workshop",
  "conf.attendance",
  "conf.event",

  // G: Travel
  "trv.long_haul",
  "trv.flight",
  "trv.accommodation",
  "trv.travel_day",

  // H: Personal Time & Recovery
  "rhy.holiday",
  "rhy.wellness_fitness",
  "rhy.wellness_self_care",
  "rhy.wellness_health_check",
  "rhy.wellness_medical",
  "rhy.social",
  "rhy.family",
  "rhy.recreation",
  "rhy.pto",
  "rhy.catchup",

  // I: Operations & Execution
  "ops.operating_review",
  "ops.admin",

  // J: Crisis, Risk & Incidents
  "risk.incident_review",
  "risk.legal_regulatory",
  "risk.reputation",
] as const;

export type CanonicalSubtypeId = (typeof CANONICAL_SUBTYPE_IDS)[number];
export type SubtypeId = CanonicalSubtypeId;

export function isCanonicalSubtype(id: string): id is CanonicalSubtypeId {
  return (CANONICAL_SUBTYPE_IDS as readonly string[]).includes(id);
}
