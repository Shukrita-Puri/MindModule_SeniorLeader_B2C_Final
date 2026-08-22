import { classifyEventV2, type ClassifyV2Input, type Confidence, type ResolvedBy } from "./classify-event-v2.ts";
import type { EventCategoryId } from "./event-categories.ts";

export interface ResolveEventResult {
  categoryId: EventCategoryId | null;
  subtypeId: string | null;
  confidence: Confidence;
  source: ResolvedBy | 'layer3_persisted';
}

/**
 * 5-layer resolution strategy:
 * 1. User override (explicit) - passed via input.userTags
 * 2. Learned token map (confirmed history) - passed via input.learned
 * 3. Persisted classification (calendar_events.event_category) - extracted from raw event
 * 4. Layered classifier (classify-event-v2 -> dictionary)
 * 5. Unresolved (internal best guess + confidence)
 */
export function resolveEventCategory(
  title: string,
  raw: any,
  inputOptions: Omit<ClassifyV2Input, 'title'> = {}
): ResolveEventResult {
  // Layer 3: Persisted classification from the database row (e.g. calendar_events)
  const persistedCategory = raw?.event_category ?? raw?.event?.event_category ?? null;
  // Note: persistedSubcategory is typically the alias string like 'routine_sync', not the exact subtypeId 'rhy.catchup'
  // But we store it in subtypeId here and downstream will map it. 
  // Actually, wait, let's keep it clean. If it's a known string, it'll bypass subtype mapping.
  let persistedSubtypeId = raw?.event_subcategory ?? raw?.event?.event_subcategory ?? null;
  
  if (persistedCategory) {
    return {
      categoryId: persistedCategory as EventCategoryId,
      subtypeId: persistedSubtypeId,
      confidence: 'high',
      source: 'layer3_persisted'
    };
  }

  // Layers 1, 2, 4, 5 are handled by classifyEventV2
  const v2Result = classifyEventV2({
    title,
    ...inputOptions
  });

  return {
    categoryId: v2Result.category,
    subtypeId: v2Result.subtypeId,
    confidence: v2Result.confidence,
    source: v2Result.resolvedBy
  };
}


// ═════════════════════════════════════════════════════════════════════════
// resolveEvent() — THE single A–H entry point for every feature surface.
// (Brief, Plan, JIT v2, Week Ahead, Smart Nudges, Insights, signal engine.)
// ═════════════════════════════════════════════════════════════════════════
import { enrichEvent, type EnrichedEvent } from "./enrich-event.ts";
import type { EventCategory } from "./event-categories.ts";
import type { EventType } from "./event-subtypes.ts";
import { EVENT_TYPE_TO_SCENARIO_ID } from "./event-subtypes.ts";

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
