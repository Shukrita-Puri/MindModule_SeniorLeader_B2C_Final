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
  /**
   * §3 Events / Triggers — verbatim canonical inventory from the CEO
   * Self-Regulation Framework doc. This is the human-readable list rendered
   * by Brief context, Insights cause-effect descriptions, Nudges copy and
   * Plan rationale. Subtype `label` strings in ./event-subtypes.ts must each
   * correspond to one of these entries — enforced by cross-layer.test.ts.
   */
  triggers: readonly string[];
  /** Pre/During/Post protocol contract (MVP self-regulation). */
  protocol: CategoryProtocol;
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory> = {
  A: {
    id: "A",
    name: "Board & Governance",
    selfRegulationFocus:
      "Emotional regulation + cognitive sharpness. Prevent decision leakage and emotional hijack before high-visibility moments. Every body copy must link physical/cognitive state to a Leadership Variable.",
    triggers: [
      "Board Meeting (in-person & remote)",
      "Board Presentation",
      "Investor / Fundraising Meeting",
      "Quarterly Business Review (QBR)",
      "End-of-Year / Annual Review",
      "Budget & Forecast Review",
      "M&A Discussion",
      "Due Diligence Session",
      "IPO Preparation Meeting",
    ],
    protocol: { pre: "Flow", during: null, post: "Pause" },
  },
  B: {
    id: "B",
    name: "Influence & Persuasion",
    selfRegulationFocus:
      "Focus activation + confidence state. Build pre-event mental clarity; recover after high-output persuasion effort. Prevent persuasion crash.",
    triggers: [
      "Sales Pitch / Pitch Meeting",
      "Investor Pitch",
      "Negotiation (deal, contract, internal)",
      "Presentation (internal & external)",
      "Regional QBR",
      "Next-Year Budget Planning",
      "Client Presentation",
      "Contract Signing / Close",
    ],
    protocol: { pre: "Flow", during: null, post: "Reenergise" },
  },
  C: {
    id: "C",
    name: "Visibility & Communication",
    selfRegulationFocus:
      "Presence + composure. Pre: prime executive presence. Post: offload performance energy, prevent audience-depletion hangover. Distinguish arousal from anxiety.",
    triggers: [
      "All-Hands / Town Hall",
      "Keynote Speech",
      "Speaking Engagement",
      "Panel Moderation",
      "Media Interview",
      "Industry / Panel Interview",
      "Press / Analyst Briefing",
      "Podcast / Video Recording",
      "Conference (speaking)",
    ],
    protocol: { pre: "Pause", during: null, post: "Reenergise" },
  },
  D: {
    id: "D",
    name: "People & Diff Conversations",
    selfRegulationFocus:
      "Emotional labour management. Prevent emotion hijack. Post: offload relational stress to protect the next interaction. Interpersonal context (who + why) drives classification — not attendee count.",
    triggers: [
      "Performance Review (giving)",
      "Difficult 1:1 (conflict, escalation, feedback)",
      "Layoff / Restructure Announcement",
      "Termination Conversation",
      "PIP Conversation",
      "1:1 with Boss / Chair / Board Member",
      "1:1 with Peer (politically charged)",
      "1:1 with Direct Report (normal)",
      "Hiring Decision Meeting",
    ],
    protocol: { pre: "Pause", during: null, post: "Pause" },
  },
  E: {
    id: "E",
    name: "Deep Work & Strategy",
    selfRegulationFocus:
      "Flow state activation. Pre: clear mental clutter, enter focus mode. Post: transition out of deep work without cognitive crash into subsequent interpersonal demands.",
    triggers: [
      "3-Year Strategy Planning",
      "3-Year Vision Setting",
      "Annual Operating Plan",
      "Competitive Intelligence Review",
      "Product Launch Planning",
      "Deep Work Block (solo)",
      "Post-Meeting Work / Follow-up Block",
    ],
    protocol: { pre: "Flow", during: "Flow", post: "Pause" },
  },
  F: {
    id: "F",
    name: "Conferences & External Events",
    selfRegulationFocus:
      "Sustained high-output regulation. Multi-day events require progressive daily recovery. Prevent cumulative fatigue and social depletion across sessions.",
    triggers: [
      "Industry Conference / Summit (attending)",
      "Conference (speaking)",
      "Off-site / Retreat",
      "Networking Event",
      "Award / Recognition Event",
      "Multi-day Customer Summit",
    ],
    protocol: { pre: "Pause", during: "Pause", post: "Reenergise", duringNotificationOnly: true },
  },
  G: {
    id: "G",
    name: "Travel",
    selfRegulationFocus:
      "Circadian regulation + pre-event readiness. Travel is an active preparation window, not dead time. Distinguish remote board meeting vs board meeting requiring a 12-hour flight.",
    triggers: [
      "Pre-flight (departure day)",
      "Short-haul flight (<4h)",
      "Long-haul flight (>4h, with wifi)",
      "Long-haul flight (>4h, offline)",
      "Landing — same-day event within 4h",
      "Landing — event next day",
      "Time-zone shift (≥3h drift)",
      "Multi-city trip (3+ destinations)",
    ],
    protocol: { pre: "Pause", during: "Pause", post: "Reenergise" },
  },
  H: {
    id: "H",
    name: "Daily Rhythm & Baseline",
    selfRegulationFocus:
      "Habit formation + baseline management. Morning: prepare for the day ahead — not generic wellness. Evening: recover-to-build, not just wind down. Sunday PM: week-ahead orientation, prevent Monday anxiety.",
    triggers: [
      "Morning Check-in (workday)",
      "Morning Check-in (weekend / PTO / public holiday)",
      "End-of-Day Wind-down",
      "Sunday Evening Reset",
      "Back-to-back Meeting Block (4+ hours)",
      "Lunch / Recovery Slot",
      "Meeting-free Deep Work Block",
    ],
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
