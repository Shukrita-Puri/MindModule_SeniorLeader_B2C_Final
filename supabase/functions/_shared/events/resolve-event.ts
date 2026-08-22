// ═════════════════════════════════════════════════════════════════════════
// THE single A–H entry point for every feature surface.
//
// Brief, Plan, JIT v2, Week Ahead, Smart Nudges, Insights (all cards) and the
// signal engine call `resolveEvent()` (or `enrichEvent()` when they need the
// full enriched struct). Nothing outside `_shared/events/` may call
// `classifyEvent()` — that keyword dictionary is now an internal layer.
//
// Resolution order (inherited from resolve-event-category.ts):
//   1. explicit user override           (raw.learned / userTags)
//   2. learned tokens                   (promoted from confirmed history)
//   3. persisted classification         (calendar_events.event_category)
//   4. layered dictionary classifier    (classify-event-v2 → event-subtypes)
//   5. unresolved                       (null category + low confidence)
//
// Passing the *raw* calendar row (rather than just a title) is what unlocks
// layers 1–3, so every call site should hand over the row when it has one.
// ═════════════════════════════════════════════════════════════════════════

import { enrichEvent, type EnrichedEvent } from "./enrich-event.ts";
import type { EventCategory, EventCategoryId } from "./event-categories.ts";
import type { EventType } from "./event-subtypes.ts";
import { EVENT_TYPE_TO_SCENARIO_ID } from "./event-subtypes.ts";

export interface ResolvedEvent {
  /** Granular §3 subtype row when one matched, else null. */
  subtype: EventType | null;
  /** A–H pillar id. May be set even when `subtype` is null (persisted/learned). */
  categoryId: EventCategoryId | null;
  category: EventCategory | null;
  /** Spec-facing second-level name, e.g. `flight`, `deep_work`, `town_hall`. */
  subcategory: string | null;
  /** Pillar display name — the value legacy code read off `subtype.bucket`. */
  bucket: string | null;
  /** Subtype display label, falling back to the pillar name. */
  label: string | null;
  scenarioId: string | null;
  confidence: EnrichedEvent["confidence"];
  source: EnrichedEvent["source"];
  /** Full enriched struct (phases, demand profile, travel arc, lead time). */
  enriched: EnrichedEvent;
}

/**
 * Accepts a bare title, or any calendar-row-shaped object (interfaces without
 * an index signature included — hence the structural `{ title?: ... }` form).
 */
export type ResolveEventInput =
  | string
  | ({ title?: string | null } & Record<string, unknown>)
  | { title?: string | null }
  | null
  | undefined;

function toRaw(input: ResolveEventInput): Record<string, unknown> {
  if (input == null) return { title: "" };
  if (typeof input === "string") return { title: input };
  return input as Record<string, unknown>;
}

/**
 * Resolve any calendar event (raw row preferred, bare title accepted) to its
 * canonical A–H category and sub-category.
 */
export function resolveEvent(input: ResolveEventInput): ResolvedEvent {
  const enriched = enrichEvent(toRaw(input));
  const subtype = enriched.subtype;
  return {
    subtype,
    categoryId: enriched.categoryId,
    category: enriched.category,
    subcategory: enriched.subcategory,
    bucket: subtype?.bucket ?? enriched.category?.name ?? null,
    label: subtype?.label ?? enriched.category?.name ?? null,
    scenarioId: subtype ? (EVENT_TYPE_TO_SCENARIO_ID[subtype.id] ?? null) : null,
    confidence: enriched.confidence,
    source: enriched.source,
    enriched,
  };
}

/** Convenience readers — same semantics as the legacy helpers they replace. */
export function resolveCategoryId(input: ResolveEventInput): EventCategoryId | null {
  return resolveEvent(input).categoryId;
}

export function resolveBucket(input: ResolveEventInput): string | null {
  return resolveEvent(input).bucket;
}

export function resolveScenarioId(input: ResolveEventInput): string | null {
  return resolveEvent(input).scenarioId;
}
