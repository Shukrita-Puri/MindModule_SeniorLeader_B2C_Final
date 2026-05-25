// Phase A — single read-only adapter over the §3/§4 shared taxonomy.
// Returns everything downstream label / scoring code needs from one
// classify call so the same event isn't re-classified in three places.
// Lives in _shared so tests can import without pulling in the entire
// generate-mastery-plan module.

import { EVENT_CATEGORIES, type EventCategoryId, type EventCategory } from './event-categories.ts';
import { classifyEvent } from './event-classifier.ts';
import { EVENT_PHASE_MAP, phaseForEvent } from './event-phase-map.ts';
import { EVENT_TYPE_TO_SCENARIO_ID, type EventType, type DemandProfile } from './event-subtypes.ts';

export interface EnrichedEvent {
  raw: any;
  title: string;
  subtype: EventType | null;
  category: EventCategory | null;
  categoryId: EventCategoryId | null;
  /** Canonical JIT lead-time in minutes from §3 subtype row, when known. */
  leadTimeMin: number | null;
  /** Per-dimension demand (cog/emo/vis/pol/rel/ene/cir/id), 0–3 each. */
  demandProfile: DemandProfile | null;
  /** Mastery scenario id when the subtype maps to one (else null). */
  scenarioId: string | null;
  /** Phase windows materialised once for downstream re-use. */
  phases: {
    pre?: ReturnType<typeof phaseForEvent>;
    during?: ReturnType<typeof phaseForEvent>;
    post?: ReturnType<typeof phaseForEvent>;
  };
}

export function enrichEvent(raw: any): EnrichedEvent {
  const title = String(raw?.title ?? raw?.event?.title ?? '').trim();
  const subtype = classifyEvent(title);
  const categoryId = subtype?.categoryId ?? null;
  const category = categoryId ? EVENT_CATEGORIES[categoryId] : null;
  const scenarioId = subtype ? (EVENT_TYPE_TO_SCENARIO_ID[subtype.id] ?? null) : null;
  const phases: EnrichedEvent['phases'] = {};
  if (categoryId) {
    if (EVENT_PHASE_MAP[categoryId].pre)    phases.pre    = phaseForEvent(title, 'pre');
    if (EVENT_PHASE_MAP[categoryId].during) phases.during = phaseForEvent(title, 'during');
    if (EVENT_PHASE_MAP[categoryId].post)   phases.post   = phaseForEvent(title, 'post');
  }
  return {
    raw,
    title,
    subtype: subtype ?? null,
    category,
    categoryId,
    leadTimeMin: subtype?.jitLeadTimeMinutes ?? null,
    demandProfile: subtype?.demandProfile ?? null,
    scenarioId,
    phases,
  };
}