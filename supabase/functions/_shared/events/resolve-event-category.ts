import { classifyEventV2, type ClassifyV2Input, type Confidence, type ResolvedBy } from "./classify-event-v2.ts";
import type { EventCategoryId } from "./event-categories.ts";
import {
  ambientLearningContext,
  lookupScopedMemoryFromContext,
  lookupScopedNegativeCategoriesFromContext,
  type LearningContext,
} from "./learning-store.ts";
import { isEngineModeV3, isEngineModeCanary, isEngineModeShadow } from "./engine-mode.ts";
import { classifyEventV3 } from "./event-classifier-v3.ts";
import { logShadowParity } from "./shadow-parity-logger.ts";

export interface ResolveEventResult {
  categoryId: EventCategoryId | null;
  subtypeId: string | null;
  confidence: Confidence;
  source: ResolvedBy | 'layer3_persisted' | 'user_override' | 'confirmed_memory' | 'v3_evidence';
}

/**
 * 5-layer resolution strategy:
 * 1. User override (explicit) - passed via input.userTags
 * 2. Learned token map & Scoped Memory (confirmed history) - passed via input.learned
 * 3. Persisted classification (calendar_events.event_category) - extracted from raw event
 * 4. Layered classifier (classify-event-v2 -> dictionary)
 * 5. Unresolved (internal best guess + confidence)
 */
export function resolveEventCategory(
  title: string,
  raw: any,
  inputOptions: Omit<ClassifyV2Input, 'title'> = {}
): ResolveEventResult {
  // Layer 1.1: Explicit call-site tags
  if (inputOptions.userTags && inputOptions.userTags.length > 0) {
    const v2Result = classifyEventV2({
      title,
      ...inputOptions,
    });
    if (v2Result.resolvedBy === "layer1_tags") {
      return {
        categoryId: v2Result.category,
        subtypeId: v2Result.subtypeId,
        confidence: v2Result.confidence,
        source: v2Result.resolvedBy,
      };
    }
  }

  // Layer 1.2: Scoped Memory (Contract 4 & 5: event, series, pattern, person, organisation)
  const rawAttendees = raw?.attendees ?? raw?.event?.attendees ?? [];
  const emails = Array.isArray(rawAttendees)
    ? rawAttendees.map((a: any) => a?.email ?? a?.contactUrl).filter(Boolean)
    : [];
  const domains = emails
    .map((e: string) => (typeof e === "string" ? e.split("@")[1]?.toLowerCase() : null))
    .filter(Boolean);

  const learningCtx: LearningContext | null = inputOptions.learned ?? ambientLearningContext();
  if (learningCtx) {
    const scopedHit = lookupScopedMemoryFromContext(learningCtx, {
      eventId: raw?.id ?? raw?.event?.id,
      seriesId: raw?.series_id ?? raw?.recurring_event_id ?? raw?.event?.series_id,
      title,
      emails,
      domains,
    });

    if (scopedHit && scopedHit.memoryType === "event_category" && scopedHit.value) {
      return {
        categoryId: scopedHit.value as EventCategoryId,
        subtypeId: scopedHit.subtypeId ?? null,
        confidence: scopedHit.confidence >= 0.8 ? 'high' : 'medium',
        source: scopedHit.source === "user" ? 'user_override' : 'confirmed_memory',
      };
    }
  }

  const negativeCategories = lookupScopedNegativeCategoriesFromContext(learningCtx, {
    eventId: raw?.id ?? raw?.event?.id,
    seriesId: raw?.series_id ?? raw?.recurring_event_id ?? raw?.event?.series_id,
    title,
    emails,
    domains,
  });

  // Layer 3: Persisted classification from the database row (e.g. calendar_events)
  const persistedCategory = raw?.event_category ?? raw?.event?.event_category ?? null;
  let persistedSubtypeId = raw?.event_subcategory ?? raw?.event?.event_subcategory ?? null;
  
  const resolvedBy = String(
    (raw?.category_resolved_by ?? raw?.event?.category_resolved_by ?? "") as string,
  ).toLowerCase();
  const persistedConfidence = String(
    (raw?.category_confidence ?? raw?.event?.category_confidence ?? "") as string,
  ).toLowerCase();
  const persistedIsAuthoritative = !!persistedCategory && (
    resolvedBy === "user_override" || resolvedBy === "user_tag" ||
    resolvedBy === "user" || persistedConfidence === "high" ||
    // No provenance recorded at all → legacy row, keep the old behaviour.
    (!resolvedBy && !persistedConfidence)
  );

  if (persistedIsAuthoritative) {
    return {
      categoryId: persistedCategory as EventCategoryId,
      subtypeId: persistedSubtypeId,
      confidence: 'high',
      source: 'layer3_persisted'
    };
  }

  // Engine Mode Switch (Spec §13, §14): legacy | shadow | v3_canary | v3
  const userId = (raw?.user_id ?? raw?.event?.user_id ?? null) as string | null;
  const isV3Active = isEngineModeV3() || isEngineModeCanary(userId);
  const isShadowActive = isEngineModeShadow();

  if (isV3Active) {
    const v3Stamp = classifyEventV3(raw ?? { title }, { excludedCategories: negativeCategories });
    const conf: Confidence = v3Stamp.categoryConfidence >= 0.75
      ? "high"
      : v3Stamp.categoryConfidence >= 0.55
      ? "medium"
      : "low";
    return {
      categoryId: v3Stamp.category,
      subtypeId: v3Stamp.subtype,
      confidence: conf,
      source: 'v3_evidence',
    };
  }

  // Legacy computation (classifyEventV2 -> dictionary / fallback)
  const v2Result = classifyEventV2({
    title,
    ...inputOptions
  });

  const legacyResult: ResolveEventResult = (!v2Result.category && persistedCategory)
    ? {
        categoryId: persistedCategory as EventCategoryId,
        subtypeId: persistedSubtypeId,
        confidence: 'medium',
        source: 'layer3_persisted'
      }
    : {
        categoryId: v2Result.category,
        subtypeId: v2Result.subtypeId,
        confidence: v2Result.confidence,
        source: v2Result.resolvedBy
      };

  // Shadow Mode: run v3 in shadow, record parity comparison, return legacy result
  if (isShadowActive) {
    try {
      const v3Stamp = classifyEventV3(raw ?? { title });
      void logShadowParity({
        userId,
        eventId: raw?.id ?? raw?.event?.id ?? null,
        title,
        legacyCategory: legacyResult.categoryId,
        legacySubtype: legacyResult.subtypeId,
        v3Stamp,
        mode: "shadow",
      }).catch(() => {});
    } catch (_err) {
      // Swallowed: shadow observation must never alter primary flow
    }
  }

  return legacyResult;
}


// ═════════════════════════════════════════════════════════════════════════
// resolveEvent() — THE single A–H entry point for every feature surface.
// (Brief, Plan, JIT v2, Week Ahead, Smart Nudges, Insights, signal engine.)
// ═════════════════════════════════════════════════════════════════════════
import { enrichEvent, type EnrichedEvent } from "./enrich-event.ts";
import type { EventCategory } from "./event-categories.ts";
import { EVENT_TYPE_TO_SCENARIO_ID, type EventType } from "./event-subtypes.ts";

import type { ClassificationStamp } from "./spine-contracts.ts";

export interface ResolvedEvent {
  /** Granular §3 subtype row when one matched, else null. */
  subtype: EventType | null;
  /** A–J pillar id. May be set even when `subtype` is null (persisted/learned). */
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
  /** Spine Contract 3: Classification Stamp */
  stamp: ClassificationStamp;
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
 * canonical A–J category and sub-category.
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
    stamp: enriched.stamp,
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
