// [KIND: specification] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Domain types for Layer 1 Demand and A–J Event Intelligence.
// Source: Part 2 Layer 1 (Section 1, 2), Final Design (§3, §4, §6, §7).

import type { CategoryLetter, CanonicalCategory } from "../../spine/categories.ts";
import type { SubtypeId, CanonicalSubtype } from "../../spine/subtypes.ts";
import type { DemandVector } from "../../spine/dimensions.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { RelationshipFinding } from "../relationships/types.ts";

export type { CategoryLetter, SubtypeId, CanonicalCategory, CanonicalSubtype };

export type EvidenceFamily =
  | "text"
  | "people"
  | "relationship"
  | "place"
  | "time"
  | "provider"
  | "memory";

export type FindingType =
  | "format"
  | "intent"
  | "topic"
  | "side"
  | "relationship"
  | "direction"
  | "setting"
  | "shape"
  | "label";

export type FindingStrength = "decisive" | "strong" | "medium" | "weak";
export type SourceTrust = "user" | "company_context" | "domain_pattern" | "org_profile" | "history" | "llm" | "provider";

export interface Finding {
  type: FindingType;
  value: string;
  family: EvidenceFamily;
  strength: FindingStrength;
  sourceTrust: SourceTrust;
  source: string;
  description?: string;
}

export type ConfirmationState =
  | "confirmed"
  | "inferred_high"
  | "inferred_medium"
  | "uncertain";

export type DecisionSource =
  | "user_correction"
  | "confirmed_memory"
  | "provider_label"
  | "evidence"
  | "llm"
  | "legacy_fallback";

export interface ItemDimensions {
  stakes: "high" | "medium" | "low";
  travelRelated: boolean;
  workContext: "work" | "personal";
  durationMinutes: number | null;
  meetingMode?: "online" | "in_person";
  isOneToOne?: boolean;
  userIsOrganiser?: boolean;
  userIsPresenting?: boolean;
  isRecurring?: boolean;
}

export interface ItemDemandComputed {
  demandProfile: DemandVector;
  arousal: number;
  switchCost: number;
  recoveryMinutes: number;
}

export interface ClassificationStamp {
  itemId: string;
  sourceType: "calendar" | "email" | "connector";
  category: CategoryLetter | null;
  categoryConfidence: number;
  subtype: SubtypeId | null;
  subtypeConfidence: number;
  bestCandidateSubtype: SubtypeId | null;
  confirmationState: ConfirmationState;
  decisionSource: DecisionSource;
  runnerUp: { category: CategoryLetter | null; subtype: SubtypeId | null; score: number } | null;
  reasons: string[];
  findings: Finding[];
  dimensions: ItemDimensions;
  itemDemand: ItemDemandComputed | null;
  taxonomyVersion: string;
  classifierVersion: string;
  classifiedAt: string;
}

export interface ResolvedEvent {
  subtype: CanonicalSubtype | null;
  categoryId: CategoryLetter | null;
  category: CanonicalCategory | null;
  subcategory: string | null;
  bucket: string | null;
  label: string | null;
  scenarioId: string | null;
  confidence: "high" | "medium" | "low";
  source: string;
  stamp: ClassificationStamp;
}

export type ResolveEventInput =
  | string
  | ({ title?: string | null } & Record<string, unknown>)
  | { title?: string | null }
  | CanonicalCalendarItem
  | null
  | undefined;
