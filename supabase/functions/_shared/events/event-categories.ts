// OWNERSHIP: coaching + engineering. SINGLE SOURCE OF TRUTH for the eight CEO
// Self-Regulation Framework pillars (A–H). This file owns:
//   - id, user-friendly name (matches causality_findings.signal_summary buckets)
//   - selfRegulationFocus (§3 of the framework doc)
//   - Pre/During/Post protocol contract (formerly FRAMEWORK_PILLARS)
//
// SCOPE BOUNDARY:
//   - Granular event subtypes (with keywords, demand profiles, JIT lead time
//     etc.) live in ./event-subtypes.ts and reference `categoryId` from here.
//   - Rich per-phase prescriptions (timing window, goal, prevents/builds)
//     live in ./event-phase-map.ts.
//   - Classification (title -> subtype/category) lives in ./event-classifier.ts.
//   - Runtime state engines (morning/evening context, fragmentation etc.)
//     live in ./state-engines.ts.

export type EventCategoryId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

/** Alias retained for the §3 (FRAMEWORK_PILLARS) → §4 contract. */
export type FrameworkPillar = EventCategoryId;

export type InterventionType = "Pause" | "Flow" | "Reenergise";

export interface CategoryProtocol {
  pre: InterventionType | null;
  during: InterventionType | null;
  post: InterventionType | null;
  /** True when DURING is delivered as a notification only — no in-app exercise. */
  duringNotificationOnly?: boolean;
}

export interface EventCategory {
  id: EventCategoryId;
  /** User-friendly name. Also used verbatim as the Insights bucket label. */
  name: string;
  /** §3 — primary self-regulation priority for this pillar. */
  selfRegulationFocus: string;
  /** Pre/During/Post protocol contract (MVP self-regulation). */
  protocol: CategoryProtocol;
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory> = {
  A: {
    id: "A",
    name: "High-Stakes Governance",
    selfRegulationFocus: "Emotional regulation + cognitive sharpness under external scrutiny",
    protocol: { pre: "Flow", during: null, post: "Pause" },
  },
  B: {
    id: "B",
    name: "Influence & Persuasion",
    selfRegulationFocus: "Focus activation + post-persuasion recharge",
    protocol: { pre: "Flow", during: null, post: "Reenergise" },
  },
  C: {
    id: "C",
    name: "Visibility & Communication",
    selfRegulationFocus: "Presence + composure under broadcast load",
    protocol: { pre: "Pause", during: null, post: "Reenergise" },
  },
  D: {
    id: "D",
    name: "People & Difficult Conversations",
    selfRegulationFocus: "Emotional labour + post-conversation offload",
    protocol: { pre: "Pause", during: null, post: "Pause" },
  },
  E: {
    id: "E",
    name: "Deep Work & Strategy",
    selfRegulationFocus: "Flow activation + clean exit",
    protocol: { pre: "Flow", during: "Flow", post: "Pause" },
  },
  F: {
    id: "F",
    name: "Conferences & External Events",
    selfRegulationFocus:
      "Pre-event social/emotional load priming; during = notification reminder only; post = depletion recovery",
    protocol: { pre: "Pause", during: "Pause", post: "Reenergise", duringNotificationOnly: true },
  },
  G: {
    id: "G",
    name: "Travel",
    selfRegulationFocus: "Circadian regulation + pre-event readiness",
    protocol: { pre: "Pause", during: "Pause", post: "Reenergise" },
  },
  H: {
    id: "H",
    name: "Daily Rhythm & Baseline",
    selfRegulationFocus: "Habit anchoring + recovery-to-build",
    protocol: { pre: "Pause", during: null, post: "Pause" },
  },
};

/** Legacy FRAMEWORK_PILLARS shape kept as an alias for callers that still
 *  import that name. Prefer `EVENT_CATEGORIES` going forward. */
export const FRAMEWORK_PILLARS = EVENT_CATEGORIES;
export type FrameworkPillarMeta = EventCategory;

export function getFrameworkPillarProtocol(p: EventCategoryId): CategoryProtocol {
  return EVENT_CATEGORIES[p].protocol;
}
