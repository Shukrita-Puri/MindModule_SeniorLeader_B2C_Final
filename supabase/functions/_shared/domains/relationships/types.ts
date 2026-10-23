// [KIND: specification] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Domain types for Layer 1 Relationships and Context Engine.
// Source: Part 2 Layer 1 (Section 3), Final Design (§5).

import type { Provenance } from "../../spine/types.ts";

export type RelationshipDirection =
  | "user_selling"
  | "user_buying"
  | "reporting_up"
  | "managing"
  | "on_stage"
  | "peers"
  | "external_collaboration"
  | "personal"
  | "unknown";

export type RelationshipRole =
  | "board_chair"
  | "board_member"
  | "investor"
  | "chief_of_staff"
  | "executive_assistant"
  | "direct_report"
  | "team_member"
  | "external_peer"
  | "customer"
  | "vendor_partner"
  | "candidate"
  | "regulator"
  | "press"
  | "event_host"
  | "adviser"
  | "family"
  | "friend"
  | "service_provider"
  | "unknown";

export type OrganisationType =
  | "education"
  | "government"
  | "health"
  | "non_profit"
  | "company"
  | "media"
  | "investor"
  | "personal"
  | "unknown";

export interface CompanyContextProfile {
  userId: string;
  userOrgDomain: string | null;
  userOrgName?: string | null;
  sectorsSoldTo: string[];
  partners: string[];
  investors: string[];
  declaredDomains: string[];
}

export type AttendeeSide = "sending" | "user_side" | "outside_org" | "personal";

export interface SideAnalysis {
  userSideDomains: Set<string>;
  outsideDomains: Map<string, string[]>; // domain -> email list
  personalEmails: string[];
  sendingDomain: string | null;
  isInternalOnly: boolean;
  hasOutsideOrganizations: boolean;
}

export interface RelationshipFinding {
  domain: string | null;
  email?: string | null;
  side: AttendeeSide;
  role: RelationshipRole;
  direction: RelationshipDirection;
  orgType: OrganisationType;
  confidence: number;
  sources: string[];
  isUserReportingUp?: boolean;
}

export interface RelationshipEngineResult {
  findings: RelationshipFinding[];
  isInternalOnly: boolean;
  hasGovernance: boolean;
  hasInvestor: boolean;
  hasPress: boolean;
  hasUserSelling: boolean;
  hasUserReportingUp: boolean;
  provenance: Provenance;
}
