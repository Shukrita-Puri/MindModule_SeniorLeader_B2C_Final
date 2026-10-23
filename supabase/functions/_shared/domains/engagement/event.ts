// [KIND: implementation] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Canonical Engagement Event Builder & Deduplication.
// Source: Part 2 Layer 0 (Section 9, 12.1, 12.4), Spine (Section 9.7).

import type { EngagementEvent, RawEngagementInput, EngagementAction } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";
import { ENGAGEMENT_ACTIONS } from "./constants.ts";

/**
 * Rounds an ISO UTC timestamp to the nearest integer second.
 * Required for deduplication rule (Layer 0, 12.4).
 */
export function roundToSecond(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return isoUtc;
  d.setMilliseconds(0);
  return d.toISOString();
}

/**
 * Computes unique deduplication key for engagement events.
 * Key: `user, refKind:refId, action, atUtc (rounded to the second)` (Layer 0, 12.4).
 */
export function computeEngagementDedupeKey(
  userId: string,
  ref: { kind: string; id: string },
  action: string,
  atUtc: string,
): string {
  const secUtc = roundToSecond(atUtc);
  return `${userId}_${ref.kind}:${ref.id}_${action}_${secUtc}`;
}

/**
 * Builds a Canonical EngagementEvent from raw telemetry.
 */
export function toCanonicalEngagementEvent(input: {
  raw: RawEngagementInput;
  provenance: Provenance;
}): EngagementEvent {
  const { raw, provenance } = input;
  const rawAction = raw.action.toLowerCase().trim();
  const action: EngagementAction = (ENGAGEMENT_ACTIONS as readonly string[]).includes(rawAction)
    ? (rawAction as EngagementAction)
    : "viewed";

  const atUtc = roundToSecond(raw.atUtc ? new Date(raw.atUtc).toISOString() : new Date().toISOString());

  return {
    schemaVersion: 1,
    userId: raw.userId,
    surface: raw.surface.trim().toLowerCase(),
    ref: {
      kind: raw.ref.kind,
      id: String(raw.ref.id).trim(),
    },
    action,
    value: raw.value ?? null,
    atUtc,
    provenance,
  };
}
