// Phase A — single read-only adapter over the §3/§4 shared taxonomy.
// Returns everything downstream label / scoring code needs from one
// classify call so the same event isn't re-classified in three places.
// Lives in _shared so tests can import without pulling in the entire
// generate-mastery-plan module.

import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventCategoryId,
} from "./event-categories.ts";
import { classifyEvent } from "./event-classifier.ts";
import { EVENT_PHASE_MAP, phaseForEvent } from "./event-phase-map.ts";
import {
  type DemandProfile,
  EVENT_TYPE_TO_SCENARIO_ID,
  type EventType,
} from "./event-subtypes.ts";

/**
 * Travel arc classification for G.flight events.
 *
 *  - `pre-only`         : reserved for very short domestic hops (<90m)
 *  - `pre-post`         : short/medium flights (<6h)
 *  - `pre-during-post`  : long-haul (≥6h)
 */
export type TravelArc = "pre-only" | "pre-post" | "pre-during-post";

function computeDurationMinutes(raw: any): number | null {
  const start = raw?.start_time ?? raw?.startTime ?? raw?.start ??
    raw?.event?.start_time;
  const end = raw?.end_time ?? raw?.endTime ?? raw?.end ?? raw?.event?.end_time;
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.round((e - s) / 60000);
}

function computeTravelArc(
  subtypeId: string | null,
  durationMin: number | null,
): TravelArc | null {
  if (!subtypeId) return null;
  const isFlight = subtypeId === "trv.flight" ||
    subtypeId === "trv.long_haul" || subtypeId === "trv.travel_day";
  if (!isFlight) return null;
  // long_haul + travel_day always route to full arc even without duration
  if (subtypeId === "trv.long_haul" || subtypeId === "trv.travel_day") {
    return "pre-during-post";
  }
  if (durationMin == null) return "pre-post";
  if (durationMin >= 360) return "pre-during-post";
  if (durationMin < 90) return "pre-only";
  return "pre-post";
}

/**
 * Derive a stable "subcategory" string from the subtype id.
 * Example: `str.deep_work` → `deep_work`, `trv.long_haul` → `flight`.
 * Consumed by Insights (secondary line), Week-Ahead persistence and Nudges.
 */
export function subcategoryFromSubtypeId(
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const aliases: Record<string, string> = {
    // Keep historical subtype ids stable while emitting spec-facing
    // subcategory names in snapshots, Week-Ahead, and Insights.
    "vis.stakeholder_comm": "stakeholder_communication",
    "trv.long_haul": "flight",
  };
  if (aliases[id]) return aliases[id];
  const idx = id.indexOf(".");
  return idx === -1 ? id : id.slice(idx + 1);
}

export interface EnrichedEvent {
  raw: any;
  title: string;
  subtype: EventType | null;
  category: EventCategory | null;
  categoryId: EventCategoryId | null;
  /** Second-level tag derived from `subtype.id` (see subcategoryFromSubtypeId). */
  subcategory: string | null;
  /** Wall-clock duration in minutes when start/end are both present. */
  durationMinutes: number | null;
  /** Only populated for G.* subtypes. Consumers use it for arc selection. */
  travelArc: TravelArc | null;
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
  const title = String(raw?.title ?? raw?.event?.title ?? "").trim();
  const subtype = classifyEvent(title);
  const categoryId = subtype?.categoryId ?? null;
  const category = categoryId ? EVENT_CATEGORIES[categoryId] : null;
  const scenarioId = subtype
    ? (EVENT_TYPE_TO_SCENARIO_ID[subtype.id] ?? null)
    : null;
  const durationMinutes = computeDurationMinutes(raw);
  const travelArc = computeTravelArc(subtype?.id ?? null, durationMinutes);
  const subcategory = subcategoryFromSubtypeId(subtype?.id ?? null);
  const phases: EnrichedEvent["phases"] = {};
  if (categoryId) {
    const timingMatrix = subtype?.timingMatrix;
    if (EVENT_PHASE_MAP[categoryId].pre && (!timingMatrix || timingMatrix.pre)) {
      phases.pre = phaseForEvent(title, "pre");
    }
    if (EVENT_PHASE_MAP[categoryId].during && (!timingMatrix || timingMatrix.during)) {
      phases.during = phaseForEvent(title, "during");
    }
    if (EVENT_PHASE_MAP[categoryId].post && (!timingMatrix || timingMatrix.post)) {
      phases.post = phaseForEvent(title, "post");
    }
  }
  return {
    raw,
    title,
    subtype: subtype ?? null,
    category,
    categoryId,
    subcategory,
    durationMinutes,
    travelArc,
    leadTimeMin: subtype?.jitLeadTimeMinutes ?? null,
    demandProfile: subtype?.demandProfile ?? null,
    scenarioId,
    phases,
  };
}
