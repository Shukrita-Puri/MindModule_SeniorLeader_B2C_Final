// [KIND: specification] [LAYER: memory] [TIERS: 0-3] [AUDIENCE: universal]
// Memory Service Types & Contracts.
// Source: Knowledge & Memory Spine (Section 9, Decisions 19, 20, 22, 39).

import type { Provenance } from "../../spine/types.ts";
import type { MemoryKind, CorrectionScope, MemoryTier } from "../../spine/vocabularies.ts";

export type { MemoryKind, CorrectionScope, MemoryTier };

export interface ScopedMemoryKey {
  scope: CorrectionScope;
  value: string; // e.g. "event:<id>", "series:<seriesId>", "pattern:<normalizedTitle>", "person:<email>", "org:<domain>"
}

export interface MemoryRecord<T = unknown> {
  id?: string;
  userId: string;
  key: ScopedMemoryKey;
  kind: MemoryKind;
  tier: MemoryTier;
  payload: T;
  isConfirmed: boolean;
  confirmedAtUtc?: string | null;
  expiresAtUtc?: string | null;
  revokedAtUtc?: string | null;
  provenance: Provenance;
}

export interface EngagementEventPayload {
  ref: {
    kind: "item" | "anchor" | "slot" | "nudge" | "brief" | "practice" | "pattern";
    id: string;
  };
  action:
    | "viewed"
    | "opened"
    | "completed"
    | "skipped"
    | "dismissed"
    | "snoozed"
    | "liked"
    | "disliked"
    | "rated"
    | "reviewed"
    | "cancelled"
    | "corrected";
  value?: string | number | null;
  atUtc: string;
  provenance: Provenance;
}

export interface ScopedItemCandidate {
  id: string;
  seriesId?: string | null;
  title: string;
  attendeeEmails?: string[];
  attendeeDomains?: string[];
}

export interface MemoryLookupQuery {
  userId: string;
  scope?: CorrectionScope;
  kind?: MemoryKind;
  tier?: MemoryTier;
  includeExpired?: boolean;
  includeRevoked?: boolean;
}
