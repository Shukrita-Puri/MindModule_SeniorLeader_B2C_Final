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
