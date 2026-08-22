// Canonical bucket/label reads for feature surfaces.
//
// Every helper here resolves through `enrichEvent()` — the single A–H entry
// point — so user overrides, learned tokens and persisted categories apply.
// Surfaces MUST import from this file (or `enrich-event.ts` directly) rather
// than the keyword-only `event-classifier.ts` helpers.

import { enrichEvent, type EnrichedEvent } from "./enrich-event.ts";
import { EVENT_TYPE_TO_SCENARIO_ID } from "./event-subtypes.ts";
import { SUBTYPE_TO_LEGACY_BUCKET } from "./event-classifier.ts";

export type EventInput = string | Record<string, unknown> | null | undefined;

function toRaw(input: EventInput): Record<string, unknown> {
  if (input == null) return { title: "" };
  if (typeof input === "string") return { title: input };
  return input;
}

/** One canonical enrichment per event. */
export function enrich(input: EventInput): EnrichedEvent {
  return enrichEvent(toRaw(input));
}

/**
 * Pattern-store / tactical-signals bucket. Preserves the historical
 * `causality_findings.signal_summary` label set. Resolves from the canonical
 * subtype only — no keyword fallback, so unresolved titles stay `null`
 * instead of being guessed at outside the learning loop.
 */
export function patternBucketFor(input: EventInput): string | null {
  const id = enrich(input).subtype?.id;
  return (id && SUBTYPE_TO_LEGACY_BUCKET[id]) || null;
}

/** Category-level bucket name (equals the A–H pillar name). */
export function eventBucketFor(input: EventInput): string | null {
  return enrich(input).subtype?.bucket ?? null;
}

/** Human-facing subtype label. */
export function eventLabelFor(input: EventInput): string | null {
  return enrich(input).subtype?.label ?? null;
}

/** Mastery scenario id for the resolved subtype, when one exists. */
export function scenarioIdForEvent(input: EventInput): string | null {
  const id = enrich(input).subtype?.id;
  return id ? (EVENT_TYPE_TO_SCENARIO_ID[id] ?? null) : null;
}
