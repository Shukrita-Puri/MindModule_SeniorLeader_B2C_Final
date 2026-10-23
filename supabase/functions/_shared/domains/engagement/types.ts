// [KIND: specification] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Domain types for Layer 0 Engagement.
// Source: Part 2 Layer 0 (Section 9, 12.1), Spine (Section 9.7).

import type { Provenance } from "../../spine/types.ts";
import type { EngagementAction, EngagementRefKind } from "./constants.ts";

export type { EngagementAction, EngagementRefKind };

export interface EngagementRef {
  kind: EngagementRefKind;
  id: string;
}

export interface EngagementEvent {
  schemaVersion: 1;
  userId: string;
  surface: string; // e.g. "brief", "plan", "nudge", "feedback_modal"
  ref: EngagementRef;
  action: EngagementAction;
  value: string | number | null;
  atUtc: string; // ISO UTC rounded to the second
  provenance: Provenance;
}

export interface RawEngagementInput {
  userId: string;
  surface: string;
  ref: EngagementRef;
  action: string;
  value?: string | number | null;
  atUtc?: string | null;
}
