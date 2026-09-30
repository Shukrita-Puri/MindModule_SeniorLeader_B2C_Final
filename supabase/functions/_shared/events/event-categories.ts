// OWNERSHIP: coaching + engineering. SINGLE SOURCE OF TRUTH for the ten CEO
// Self-Regulation Framework pillars (A–J). This file owns:
//   - id, user-friendly name (matches causality_findings.signal_summary buckets)
//   - bucketKey (stable identifier for causality & 365 pattern storage)
//   - selfRegulationFocus (§3 of the framework doc)
//   - Pre/During/Post protocol contract (formerly FRAMEWORK_PILLARS)
//   - demandBaseline (8-dimension baseline + arousal + switchCost)
//
// SCOPE BOUNDARY:
//   - Granular event subtypes (with keywords, demand profiles, JIT lead time
//     etc.) live in ./event-subtypes.ts and reference `categoryId` from here.
//   - Rich per-phase prescriptions (timing window, goal, prevents/builds)
//     live in ./event-phase-map.ts.
//   - Classification (title -> subtype/category) lives in ./event-classifier.ts.
//   - Runtime state engines (morning/evening context, fragmentation etc.)
//     live in ./state-engines.ts.

export type EventCategoryId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J";

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

export type CategoryDemandBaseline = {
  cog: number;
  emo: number;
  vis: number;
  pol: number;
  rel: number;
  ene: number;
  cir: number;
  id: number;
  arousal: number;
  switchCost: number;
};

export interface EventCategory {
  id: EventCategoryId;
  /** User-friendly name. Rendered on the Insights card and throughout the UI. */
  name: string;
  /** Stable bucket key to isolate pattern/causality storage keys from display renames. */
  bucketKey: string;
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
  /** Default 8-dimension demand baseline + arousal and switchCost */
  demandBaseline: CategoryDemandBaseline;
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory> = {
  A: {
    id: "A",
    name: "Board & Governance",
    bucketKey: "board_governance",
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
    demandBaseline: { cog: 3, emo: 2, vis: 2, pol: 3, rel: 2, ene: 2, cir: 0, id: 3, arousal: 2, switchCost: 1 },
  },
  B: {
    id: "B",
    name: "Pitches, Deals & Negotiations",
    bucketKey: "influence_persuasion",
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
    demandBaseline: { cog: 2, emo: 2, vis: 2, pol: 2, rel: 3, ene: 2, cir: 0, id: 2, arousal: 2, switchCost: 1 },
  },
  C: {
    id: "C",
    name: "Public Speaking & Media",
    bucketKey: "visibility_communication",
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
    demandBaseline: { cog: 2, emo: 2, vis: 3, pol: 2, rel: 1, ene: 3, cir: 0, id: 3, arousal: 3, switchCost: 1 },
  },
  D: {
    id: "D",
    name: "People & Team Dynamics",
    bucketKey: "interpersonal_high_stakes",
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
    demandBaseline: { cog: 2, emo: 3, vis: 1, pol: 2, rel: 3, ene: 2, cir: 0, id: 2, arousal: 2, switchCost: 1 },
  },
  E: {
    id: "E",
    name: "Strategic Thinking & Decision Making",
    bucketKey: "deep_work_strategy",
    selfRegulationFocus:
      "Flow state activation. Pre: clear mental clutter, enter focus mode. Post: transition out of deep work without cognitive crash into subsequent interpersonal demands.",
    triggers: [
      "3-Year Strategy Planning",
      "3-Year Vision Setting",
      "Annual Operating Plan",
      "Competitive Intelligence Review",
      "Deep Work Block (solo)",
      "Post-Meeting Work / Follow-up Block",
    ],
    protocol: { pre: "Flow", during: "Flow", post: "Pause" },
    demandBaseline: { cog: 3, emo: 1, vis: 0, pol: 1, rel: 0, ene: 1, cir: 0, id: 1, arousal: 1, switchCost: 3 },
  },
  F: {
    id: "F",
    name: "Conferences & External Events",
    bucketKey: "conferences_external_events",
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
    demandBaseline: { cog: 1, emo: 1, vis: 2, pol: 1, rel: 2, ene: 3, cir: 1, id: 1, arousal: 1, switchCost: 1 },
  },
  G: {
    id: "G",
    name: "Travel",
    bucketKey: "travel",
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
    demandBaseline: { cog: 1, emo: 1, vis: 0, pol: 0, rel: 0, ene: 2, cir: 3, id: 0, arousal: 1, switchCost: 1 },
  },
  H: {
    id: "H",
    name: "Personal Time & Recovery",
    bucketKey: "daily_rhythm_baseline",
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
    demandBaseline: { cog: 0, emo: 1, vis: 0, pol: 0, rel: 1, ene: 0, cir: 0, id: 0, arousal: 0, switchCost: 0 },
  },
  I: {
    id: "I",
    name: "Operations & Execution",
    bucketKey: "operations_execution",
    selfRegulationFocus:
      "Endurance, rapid task switching and cognitive pacing across the working rhythm. Prevent grind fatigue and switching cost across back-to-back execution.",
    triggers: [
      "Product Launch Planning",
      "Routine sync / Catch-up",
      "Weekly business review / KPI review",
      "Pipeline / Sprint review / Retro",
      "Compliance / Legal / Filing",
      "Admin / Approvals / Inbox block",
    ],
    protocol: { pre: null, during: null, post: "Reenergise" },
    demandBaseline: { cog: 2, emo: 1, vis: 0, pol: 1, rel: 1, ene: 2, cir: 0, id: 0, arousal: 1, switchCost: 3 },
  },
  J: {
    id: "J",
    name: "Crisis, Risk & Incidents",
    bucketKey: "crisis_risk_incidents",
    selfRegulationFocus:
      "Acute nervous-system regulation. Stabilise panic, keep judgement clear under time pressure, decompress after.",
    triggers: [
      "Crisis / Incident Call / War Room",
      "Post-Incident Review / Post-Mortem",
      "Litigation / Regulatory Investigation",
      "Reputation / Press Crisis",
      "P1 / SEV1 Incident",
      "Dispute / Outside Counsel Escalation",
    ],
    protocol: { pre: "Pause", during: "Pause", post: "Pause" },
    demandBaseline: { cog: 3, emo: 3, vis: 2, pol: 3, rel: 2, ene: 3, cir: 1, id: 3, arousal: 3, switchCost: 2 },
  },
};

/** Legacy FRAMEWORK_PILLARS shape kept as an alias for callers that still
 *  import that name. Prefer `EVENT_CATEGORIES` going forward. */
export const FRAMEWORK_PILLARS = EVENT_CATEGORIES;
export type FrameworkPillarMeta = EventCategory;

export function getFrameworkPillarProtocol(p: EventCategoryId): CategoryProtocol {
  return EVENT_CATEGORIES[p].protocol;
}

/** Backward compatibility map from legacy category names to bucketKey */
export const LEGACY_CATEGORY_NAME_TO_BUCKET_KEY: Record<string, string> = {
  "Board & Governance": "board_governance",
  "Influence & Persuasion": "influence_persuasion",
  "Visibility & Communication": "visibility_communication",
  "Interpersonal High-Stakes": "interpersonal_high_stakes",
  "Deep Work & Strategy": "deep_work_strategy",
  "Conferences & External Events": "conferences_external_events",
  "Travel": "travel",
  "Daily Rhythm & Baseline": "daily_rhythm_baseline",
  "Pitches, Deals & Negotiations": "influence_persuasion",
  "Public Speaking & Media": "visibility_communication",
  "People & Team Dynamics": "interpersonal_high_stakes",
  "Strategic Thinking & Decision Making": "deep_work_strategy",
  "Personal Time & Recovery": "daily_rhythm_baseline",
  "Operations & Execution": "operations_execution",
  "Crisis, Risk & Incidents": "crisis_risk_incidents",
};
