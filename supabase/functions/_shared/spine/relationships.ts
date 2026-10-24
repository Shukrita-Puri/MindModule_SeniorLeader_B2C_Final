// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Neutral Relationship Vocabulary (15 Canonical Neutral Roles).
// Source: Part 2 Layer 1 (Section 3), Final Design (§5), Part 4 Tree (C6).

export const CANONICAL_RELATIONSHIP_ROLES = [
  "board_member",
  "direct_boss",
  "investor",
  "regulator",
  "acquirer_target",
  "skip_level",
  "journalist_media",
  "customer",
  "client",
  "external_partner",
  "report_direct",
  "peer",
  "vendor",
  "report_junior",
  "unknown",
] as const;

export type CanonicalRelationshipRole = (typeof CANONICAL_RELATIONSHIP_ROLES)[number];

export const CANONICAL_RELATIONSHIP_DIRECTIONS = [
  "user_selling",
  "user_buying",
  "reporting_up",
  "managing",
  "on_stage",
  "peers",
  "external_collaboration",
  "personal",
  "unknown",
] as const;

export type CanonicalRelationshipDirection = (typeof CANONICAL_RELATIONSHIP_DIRECTIONS)[number];
