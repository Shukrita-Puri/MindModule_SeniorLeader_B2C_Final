// OWNERSHIP: engineering + coaching. Trigger logic / phase prescriptions
// change via code review only. Do not edit in a chat-driven session without
// an explicit human request.
//
// §2 Six protocol combinations + §3 Eight CEO Event Categories from the
// CEO Self-Regulation Framework v1.0. Pure data + pure deterministic
// classifiers. No IO, no fetches.
//
// SCOPE BOUNDARY: this file owns coaching/clinical taxonomy (protocols,
// event matrix). It does NOT own product/copy vocabulary — pillars, stakes
// and keyword lists live in executive-state-taxonomy.ts. Consumers must
// route behaviour decisions through behaviour-evaluator.evaluate(), not
// import from either taxonomy file directly.

// --- §2 Protocol combinations -------------------------------------------
export type Protocol = "mindset" | "somatic";
export type ProtocolMode = "pause" | "flow" | "reenergise";
export type ComboKey = `${Protocol}.${ProtocolMode}`;

export interface ProtocolCombo {
  protocol: Protocol;
  mode: ProtocolMode;
  /** Doc §2 verbatim — when this combo is the right intervention. */
  whenToUse: string;
  /** Doc §2 verbatim — what the combo produces. */
  outcome: string;
}

export const PROTOCOL_COMBOS: Record<ComboKey, ProtocolCombo> = {
  "mindset.pause": {
    protocol: "mindset", mode: "pause",
    whenToUse: "Reactive thinking, decision fatigue, identity threat",
    outcome: "Clarity and detachment before high-consequence decision",
  },
  "mindset.flow": {
    protocol: "mindset", mode: "flow",
    whenToUse: "Pre-execution focus, narrative priming, intent setting",
    outcome: "Aligned attention, single-thread focus on outcome",
  },
  "mindset.reenergise": {
    protocol: "mindset", mode: "reenergise",
    whenToUse: "Post-event integration, meaning-making, identity reinforcement",
    outcome: "Closure, lesson capture, executive identity consolidation",
  },
  "somatic.pause": {
    protocol: "somatic", mode: "pause",
    whenToUse: "Sympathetic dominance, elevated HR, masked fatigue",
    outcome: "Parasympathetic re-entry, HRV stabilisation",
  },
  "somatic.flow": {
    protocol: "somatic", mode: "flow",
    whenToUse: "Pre-stage activation, physical readiness, breath cadence",
    outcome: "Coherent state — body matches the demand of the next block",
  },
  "somatic.reenergise": {
    protocol: "somatic", mode: "reenergise",
    whenToUse: "End-of-day depletion, post-travel, circadian drift",
    outcome: "Hardware recovery — sleep priming, vagal reset",
  },
};

/**
 * Legacy `SlotBoost.practiceType` → preferred (protocol, mode).
 *
 * SINGLE SOURCE OF TRUTH for this mapping. `generate-mastery-plan` must
 * import this constant in Phase 2 and stop using string literals. Do not
 * duplicate the mapping anywhere — if a second copy appears in review,
 * reject the PR.
 */
export const PRACTICE_TYPE_TO_COMBO = {
  regulate:  { protocol: "somatic",  mode: "pause"      },
  align:     { protocol: "mindset",  mode: "pause"      },
  prepare:   { protocol: "mindset",  mode: "flow"       },
  integrate: { protocol: "mindset",  mode: "reenergise" },
} as const satisfies Record<string, { protocol: Protocol; mode: ProtocolMode }>;

export type LegacyPracticeType = keyof typeof PRACTICE_TYPE_TO_COMBO;

export function comboFor(practiceType: LegacyPracticeType): ProtocolCombo {
  const { protocol, mode } = PRACTICE_TYPE_TO_COMBO[practiceType];
  return PROTOCOL_COMBOS[`${protocol}.${mode}` as ComboKey];
}

// --- §3 Eight CEO Event Categories --------------------------------------
export type EventCategoryId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface EventPhase {
  timing: string;
  combo: ComboKey;
  goal: string;
  prevents: string;
}

export interface EventCategory {
  id: EventCategoryId;
  name: string;
  /** Lowercase title-substring triggers from doc §3. Matched case-insensitively. */
  triggers: string[];
  selfRegulationFocus: string;
  phases: {
    pre?: EventPhase;
    during?: EventPhase;
    post?: EventPhase;
  };
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory> = {
  A: {
    id: "A", name: "HIGH-STAKES GOVERNANCE",
    triggers: ["board", "investor", "earnings", "shareholder", "audit committee"],
    selfRegulationFocus: "Executive Presence under external scrutiny",
    phases: {
      pre:    { timing: "T-60 to T-15min", combo: "somatic.flow",
                goal: "Coherent activation, breath cadence locked",
                prevents: "Sympathetic spike on entry" },
      during: { timing: "in-room",         combo: "mindset.flow",
                goal: "Single-thread focus on outcome, not optics",
                prevents: "Decision leakage from self-monitoring" },
      post:   { timing: "T+30 to T+90min", combo: "mindset.reenergise",
                goal: "Capture lesson, consolidate identity",
                prevents: "Post-peak hangover into next block" },
    },
  },
  B: {
    id: "B", name: "PEOPLE & EMOTIONAL LABOUR",
    triggers: ["1:1", "one on one", "performance review", "layoff", "termination", "hr review", "hr meeting"],
    selfRegulationFocus: "Internal Buffer — emotional regulation under empathy load",
    phases: {
      pre:    { timing: "T-15min",  combo: "somatic.pause",
                goal: "Parasympathetic re-entry before emotional draw",
                prevents: "Carrying prior block's charge into the conversation" },
      during: { timing: "in-room",  combo: "mindset.pause",
                goal: "Detachment without disengagement",
                prevents: "Reactive identity threat" },
      post:   { timing: "T+15min",  combo: "somatic.pause",
                goal: "Discharge residual emotional load",
                prevents: "Decision leakage into next block" },
    },
  },
  C: {
    id: "C", name: "STRATEGIC DECISION",
    triggers: ["strategy", "decision", "deal", "negotiation", "term sheet", "offsite"],
    selfRegulationFocus: "Decision Power — clarity over speed",
    phases: {
      pre:    { timing: "T-30min",  combo: "mindset.pause",
                goal: "Detach from sunk cost, surface true criteria",
                prevents: "Anchoring bias under fatigue" },
      during: { timing: "in-room",  combo: "mindset.flow",
                goal: "Single-thread reasoning on the actual question",
                prevents: "Premature convergence" },
    },
  },
  D: {
    id: "D", name: "EXTERNAL VISIBILITY",
    triggers: ["keynote", "press", "media", "podcast", "interview", "panel", "stage"],
    selfRegulationFocus: "Executive Presence under broadcast load",
    phases: {
      pre:    { timing: "T-45min",  combo: "somatic.flow",
                goal: "Voice, posture, breath cadence",
                prevents: "Adrenal spike compressing range" },
      post:   { timing: "T+30min",  combo: "somatic.pause",
                goal: "Discharge stage chemistry",
                prevents: "Post-peak hangover" },
    },
  },
  E: {
    id: "E", name: "DEEP WORK & CREATION",
    triggers: ["deep work", "writing", "design review", "architecture", "focus block"],
    selfRegulationFocus: "Mental Bandwidth — protected attention",
    phases: {
      pre:    { timing: "T-10min",  combo: "mindset.flow",
                goal: "Intent + first-move primed",
                prevents: "Cold-start churn" },
    },
  },
  F: {
    id: "F", name: "TRAVEL & TIME-ZONE TRANSITION",
    triggers: ["flight", "travel", "airport", "redeye"],
    selfRegulationFocus: "Operational Drive — circadian re-entry",
    phases: {
      pre:    { timing: "T-2h",   combo: "somatic.pause",
                goal: "Pre-load parasympathetic state for compressed travel",
                prevents: "Cumulative depletion across legs" },
      post:   { timing: "on arrival", combo: "somatic.reenergise",
                goal: "Hardware recovery, sleep priming",
                prevents: "Day-2 cognitive decline" },
    },
  },
  G: {
    id: "G", name: "TEAM RHYTHM & OPERATIONAL",
    triggers: ["standup", "team meeting", "review", "weekly", "all hands", "syncing"],
    selfRegulationFocus: "Operational Drive — sustained low-grade output",
    phases: {
      during: { timing: "in-room",  combo: "mindset.flow",
                goal: "Stay present without over-investing",
                prevents: "Energy leak from over-engagement" },
    },
  },
  H: {
    id: "H", name: "DAILY RHYTHM & RECOVERY",
    triggers: ["lunch", "break", "commute", "evening", "recovery"],
    selfRegulationFocus: "Physical Recovery — buffer reconstruction",
    phases: {
      during: { timing: "in-window", combo: "somatic.reenergise",
                goal: "Active recovery, not passive scrolling",
                prevents: "End-of-day collapse" },
    },
  },
};

const STAKES_TO_CATEGORY: Record<string, EventCategoryId> = {
  board: "A", external: "A", investor: "A",
};

export function classifyEvent(
  title: string,
  stakesLevel?: string | null,
): EventCategoryId | null {
  if (stakesLevel) {
    const hit = STAKES_TO_CATEGORY[stakesLevel.toLowerCase()];
    if (hit) return hit;
  }
  if (!title) return null;
  const t = title.toLowerCase();
  for (const cat of Object.values(EVENT_CATEGORIES)) {
    if (cat.triggers.some((kw) => t.includes(kw))) return cat.id;
  }
  return null;
}

export function protocolsForEvent(
  title: string,
  phase: "pre" | "during" | "post",
  stakesLevel?: string | null,
): ProtocolCombo | null {
  const id = classifyEvent(title, stakesLevel);
  if (!id) return null;
  const ph = EVENT_CATEGORIES[id].phases[phase];
  if (!ph) return null;
  return PROTOCOL_COMBOS[ph.combo];
}