/**
 * ============================================================
 * Load Shape — Canonical Type Definitions
 * supabase/functions/_shared/load-shape/types.ts
 *
 * SINGLE SOURCE OF TRUTH — import from here only.
 * No surface, engine, or rule may define its own LoadShape.
 *
 * Pre-flight check results (see plan):
 *
 *  1. Event categories A–H already exist as `EventCategoryId` in
 *     `../events/event-categories.ts` (where the name `EventCategory`
 *     is taken by a metadata interface). We import and alias it here
 *     rather than re-declaring the union. Resolution itself always
 *     stays with resolveEvent()/enrichEvent() — Load Shape never
 *     classifies an event.
 *
 *  2. `CATEGORY_TO_MODE` lives in `./modes.ts`, not here, and the
 *     private `modeOf()` map inside cause-effect-engine is left
 *     untouched for launch safety. `modes.test.ts` asserts the two
 *     agree on the five shared labels so they cannot silently
 *     diverge. Post-launch follow-up: delete the engine's private
 *     map and import CATEGORY_TO_MODE from ./modes.ts.
 *
 * Version: 1.1 (pre-launch, subcategories added)
 * ============================================================
 */

import type { EventCategoryId } from "../events/event-categories.ts";

/**
 * Top-level event categories A–H.
 * Alias of the canonical `EventCategoryId` — never re-declared here.
 */
export type EventCategory = EventCategoryId;
export type { EventCategoryId };

/**
 * Full subcategory taxonomy — all 28 subcategories from
 * FINAL_A_to_H_Schema_Summary.md. Names are LOCKED to that doc.
 *
 * A — BOARD/GOVERNANCE
 *   A           Corporate board meetings, board decisions
 *   A.trustee   School/nonprofit board roles
 *   A.strategy  Multi-hour strategic decision sessions
 *
 * B — PERSUASION/PITCHING
 *   B                     Investor pitches, sales calls, close meetings
 *   B.client_presentation Presenting to existing client
 *   B.pitch_competitive   Pitching in competitive process
 *
 * C — VISIBILITY/MEDIA
 *   C                           Public speaking at conferences (default)
 *   C.speaking                  Leading a talk/presentation at event
 *   C.stakeholder_communication Presenting strategy/results to leadership
 *   C.media                     Press interviews, media appearances
 *   C.roundtable                SPEAKING AT a roundtable (not member)
 *   C.town_hall                 All-hands, company-wide communication
 *
 * D — INTERPERSONAL HIGH-STAKES
 *   D                        High-stakes 1:1s with powerful person
 *   D.difficult_conversation Conflict, performance review, feedback
 *   D.hiring_interview       Interviewing a candidate
 *   D.crisis_decision        Rapid decision under pressure
 *
 * E — DEEP WORK/FOCUS
 *   E.routine_sync  Standup, team sync, regular tactical meetings
 *   E.deep_work     ACTIVE focus block, analysis, design, reviews
 *   E.learning      PASSIVE education the user attends
 *   E.community     Professional community group the user is MEMBER OF
 *   E.review        Design/product/budget review
 *   E.compliance    Regulatory filing, audit, legal review
 *
 * F — CONFERENCE/MULTI-DAY
 *   F           Multi-session conference, summit (2+ days)
 *   F.workshop  All-day or multi-day workshop
 *   F.event     Multi-day event (conference, expo, festival)
 *
 * G — TRAVEL
 *   G.flight        Flight — arc logic: <6h pre/post; 6h+ pre/during/post
 *   G.accommodation Hotel, airbnb, multi-day stay
 *   G.travel_day    Full day of transit/travel
 *
 * H — RHYTHM & RECOVERY
 *   H.wellness_fitness      Gym, workout, walk, run, yoga, sports
 *   H.wellness_self_care    Massage, spa, salon, self-care treatment
 *   H.wellness_health_check Weigh day, vitals check
 *   H.wellness_medical      Doctor, dentist, physiotherapy, procedure
 *   H.social                1:1 casual time with friend/colleague
 *   H.family                Birthday, anniversary, school event
 *   H.holiday               Public holiday (gate: is_all_day == true)
 *   H.pto                   Vacation, time off, personal leave
 *   H.recreation            Entertainment, show, concert, restaurant
 */
export type EventSubcategory =
  // A — Board/Governance
  | "A"
  | "A.trustee"
  | "A.strategy"
  // B — Persuasion/Pitching
  | "B"
  | "B.client_presentation"
  | "B.pitch_competitive"
  // C — Visibility/Media
  | "C"
  | "C.speaking"
  | "C.stakeholder_communication"
  | "C.media"
  | "C.roundtable"
  | "C.town_hall"
  // D — Interpersonal High-Stakes
  | "D"
  | "D.difficult_conversation"
  | "D.hiring_interview"
  | "D.crisis_decision"
  // E — Deep Work/Focus
  | "E.routine_sync"
  | "E.deep_work"
  | "E.learning"
  | "E.community"
  | "E.review"
  | "E.compliance"
  // F — Conference/Multi-day
  | "F"
  | "F.workshop"
  | "F.event"
  // G — Travel
  | "G.flight"
  | "G.accommodation"
  | "G.travel_day"
  // H — Rhythm & Recovery
  | "H.wellness_fitness"
  | "H.wellness_self_care"
  | "H.wellness_health_check"
  | "H.wellness_medical"
  | "H.social"
  | "H.family"
  | "H.holiday"
  | "H.pto"
  | "H.recreation";

/**
 * Helper: extract the top-level category letter from a subcategory string.
 * e.g. subcategoryToCategory('E.deep_work') → 'E'
 */
export function subcategoryToCategory(sub: EventSubcategory): EventCategory {
  return sub.split(".")[0] as EventCategory;
}

/**
 * The 8 demand modes — one per top-level category A–H.
 * The A–H → mode mapping itself lives in ./modes.ts.
 *
 * A → governance   Board-level accountability, fiduciary decisions
 * B → performance  Influence, persuasion, pitching, closing
 * C → visibility   Public presence, reputation, broadcast
 * D → relational   Emotional labour, conflict, interpersonal stakes
 * E → cognitive    Deep work, focus, analysis, learning, community
 * F → social       Conference stamina, networking, sustained social output
 * G → logistical   Travel, circadian disruption, physical transitions
 * H → rhythmic     Recovery, baseline anchors, personal rhythm
 */
export type DemandMode =
  | "governance"
  | "performance"
  | "visibility"
  | "relational"
  | "cognitive"
  | "social"
  | "logistical"
  | "rhythmic";

/**
 * The seven day-level load shapes.
 *
 * Precedence (first match wins):
 *   travel_adjacent → back_to_back → switching →
 *   weight_heavy → volume_heavy → focused → light
 *
 * LAUNCH (copy wired now): back_to_back, switching
 * NEXT SPRINT (type + classifier only): the rest
 */
export type ShapeId =
  /** ≥4h consecutive meetings with <15 min gaps. */
  | "back_to_back"
  /** ≥3 demand modes in a day, or ≥2 including 'relational'. */
  | "switching"
  /** High stakes weight, ≤4 meetings. */
  | "weight_heavy"
  /** ≥7 meetings, low stakes weight. */
  | "volume_heavy"
  /** A/B/C event within 12h of a G event. */
  | "travel_adjacent"
  /** Cognitive-dominant day with ≤1 mode switch. */
  | "focused"
  /** Default catch-all — recovery day. */
  | "light";

/**
 * The full LoadShape stored in daily_context_snapshot.load_shape.
 *
 * NULL SAFETY CONTRACT (all consumers must honour this):
 *   null = no calendar data, API error, or first run.
 *   Treat null as { shapeId: 'light' }. Never throw. Never surface
 *   an error state. Use getLoadShapeOrDefault() below.
 */
export interface LoadShape {
  /** Classified shape — primary key for copy, sentences, nudge severity. */
  shapeId: ShapeId;
  /** Display label, e.g. "Back-to-back day" — use in UI, not shapeId. */
  shapeLabel: string;

  /** Hours of consecutive meetings with <15 min gaps. */
  backToBackHours: number;
  /** Ratio of short-gap transitions to total transitions (0–1). */
  shortGapRatio: number;

  /** Demand modes in local-day order, derived from A–H via CATEGORY_TO_MODE. */
  modeSequence: DemandMode[];
  /** Count of distinct adjacent mode transitions in modeSequence. */
  modeSwitchCount: number;

  /** Aggregate stakes weight across all events. */
  stakesWeight: number;
  /** Total discrete calendar events for the day. */
  meetingCount: number;
  /** stakesWeight / meetingCount — high = weight-heavy, low = volume-heavy. */
  weightRatio: number;

  /** True if any A, B, or C event falls within 12h of a G event. */
  travelAdjacency: boolean;
  /** Subcategory of the G event that triggered travelAdjacency, if any. */
  travelSubcategory?: "G.flight" | "G.travel_day" | "G.accommodation";
  /** Arc type for the triggering flight: 'short' (<6h) or 'long_haul' (6h+). */
  flightArcType?: "short" | "long_haul";

  /** Why this shape was assigned. Always ≥1 string. */
  evidence: string[];
}

/** Frontend-safe subset. Use in React components and UI logic only. */
export type ShapeMeta = Pick<LoadShape, "shapeId" | "shapeLabel">;

export interface ShapeDisplayConfig {
  shapeId: ShapeId;
  label: string;
  tooltip: string;
  /** The insight the user should be able to form — launch acceptance criterion. */
  northStarInsight: string;
  /** true = wire copy + insight sentences now. false = copy next sprint. */
  launchReady: boolean;
}

export const SHAPE_DISPLAY_CONFIG: Record<ShapeId, ShapeDisplayConfig> = {
  back_to_back: {
    shapeId: "back_to_back",
    label: "Back-to-back day",
    tooltip:
      "Four or more hours of consecutive meetings with less than 15 minutes between them.",
    northStarInsight: "My decisions get worse after 3 hours of consecutive calls.",
    launchReady: true,
  },
  switching: {
    shapeId: "switching",
    label: "Mode-switching day",
    tooltip:
      "Three or more different types of demand — e.g. board-level decisions, then a difficult 1:1, then deep work — in a single day.",
    northStarInsight: "Mode-switching days cost me more than any single meeting type.",
    launchReady: true,
  },
  weight_heavy: {
    shapeId: "weight_heavy",
    label: "High-weight day",
    tooltip:
      "Few meetings but each one carries major consequence. The drain is intensity, not volume.",
    northStarInsight: "High-stakes light days drain me as much as busy ones.",
    launchReady: false,
  },
  volume_heavy: {
    shapeId: "volume_heavy",
    label: "High-volume day",
    tooltip:
      "Seven or more meetings, most of them low-stakes. Fatigue accumulates through sheer count.",
    northStarInsight: "Volume alone — even low-stakes — accumulates fatigue.",
    launchReady: false,
  },
  travel_adjacent: {
    shapeId: "travel_adjacent",
    label: "Travel-adjacent day",
    tooltip:
      "A high-stakes event falls within 12 hours of a flight or travel day. Circadian disruption meets peak performance demand.",
    northStarInsight: "My performance dips the day of and after flights.",
    launchReady: false,
  },
  focused: {
    shapeId: "focused",
    label: "Focused day",
    tooltip:
      "Most of the day is deep work, analysis, or learning — with minimal switching. A positive shape worth protecting.",
    northStarInsight: "Focused days are when I do my best thinking.",
    launchReady: false,
  },
  light: {
    shapeId: "light",
    label: "Light day",
    tooltip:
      "Low meeting count, low stakes, no travel, no switching. Recovery days build next-week performance.",
    northStarInsight:
      "Recovery days show up in my next week, not just how I feel tonight.",
    launchReady: false,
  },
};

// ── Surface consumer contracts ────────────────────────────────
// Each surface gets a typed Pick<> of only what it reads.

/** cause-effect-engine v23 */
export type CauseEffectShapeInput = Pick<
  LoadShape,
  "shapeId" | "modeSwitchCount" | "backToBackHours" | "stakesWeight" | "evidence"
>;

/** brief-context.ts → deterministic-brief.ts */
export type BriefShapeInput = Pick<
  LoadShape,
  | "shapeId"
  | "shapeLabel"
  | "modeSequence"
  | "modeSwitchCount"
  | "backToBackHours"
  | "travelAdjacency"
>;

/** Mastery plan scorer — tie-breaker only, does not override eligibility. */
export type PlanShapeInput = Pick<LoadShape, "shapeId">;

/** Nudge evaluator — meetingPrepCliff stacks on switching. */
export type NudgeShapeInput = Pick<
  LoadShape,
  "shapeId" | "backToBackHours" | "modeSwitchCount" | "stakesWeight"
>;

// ── Classifier input ──────────────────────────────────────────
// classifyLoadShape(input) is called ONLY by build-daily-context.

export interface ClassifyLoadShapeEvent {
  subcategory: EventSubcategory;
  /** Pre-computed via subcategoryToCategory(). */
  category: EventCategory;
  startTime: Date;
  endTime: Date;
  stakesLevel: "low" | "medium" | "high" | "critical";
  /** For G.flight only: flight duration in minutes. */
  flightDurationMinutes?: number;
}

export interface ClassifyLoadShapeInput {
  events: ClassifyLoadShapeEvent[];
  /**
   * Timed calendar events that exist today but whose A–H category could not
   * be resolved. They never influence any shape metric — they only keep the
   * evidence honest so no surface claims "no calendar data" on a day that
   * actually had meetings.
   */
  unresolvedCount?: number;
  ctx: {
    /** ISO date string, e.g. "2024-03-15". */
    localDate: string;
    /** UTC offset in minutes. */
    timezoneOffset: number;
  };
}

export type ClassifyLoadShapeResult = LoadShape;

// ── Snapshot column type + null safety helpers ────────────────

/** The load_shape column in daily_context_snapshot (jsonb, nullable). */
export type SnapshotLoadShape = LoadShape | null;

/** Type guard — use before reading any shape field. */
export function hasLoadShape(value: unknown): value is LoadShape {
  return value !== null && typeof value === "object" &&
    "shapeId" in (value as Record<string, unknown>);
}

/**
 * Safe accessor — returns LoadShape or a light-day fallback.
 * Every consumer calls this instead of reading load_shape directly.
 */
export function getLoadShapeOrDefault(value: unknown): LoadShape {
  if (hasLoadShape(value)) return value;
  return {
    shapeId: "light",
    shapeLabel: "Light day",
    backToBackHours: 0,
    shortGapRatio: 0,
    modeSequence: [],
    modeSwitchCount: 0,
    stakesWeight: 0,
    meetingCount: 0,
    weightRatio: 0,
    travelAdjacency: false,
    evidence: ["No calendar data available — defaulting to light day"],
  };
}
