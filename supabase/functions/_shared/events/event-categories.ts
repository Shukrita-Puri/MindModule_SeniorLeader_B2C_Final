// OWNERSHIP: coaching + engineering. §3 of CEO Self-Regulation Framework v1.0
// — the eight CEO Event Categories (A–H), their trigger keywords, and the
// per-category Self-Regulation Focus.
//
// SCOPE BOUNDARY: this file owns *what kind of event this is*. It does NOT
// own per-phase prescriptions (timing / protocol / goal / prevents-builds) —
// that lives in events/event-phase-map.ts. It also does NOT own behaviour
// rules — those live in ceo-behaviour/*.ts. Keeping §3 thin lets the
// classifier stay trustworthy while §4 churns.

export type EventCategoryId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface EventCategory {
  id: EventCategoryId;
  name: string;
  /** Lowercase title-substring triggers from doc §3. Matched case-insensitively. */
  triggers: string[];
  /** Doc §3 — the primary self-regulation priority for this pillar. */
  selfRegulationFocus: string;
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory> = {
  A: {
    id: "A", name: "HIGH-STAKES GOVERNANCE",
    triggers: ["board", "investor", "earnings", "shareholder", "audit committee"],
    selfRegulationFocus: "Executive Presence under external scrutiny",
  },
  B: {
    id: "B", name: "PEOPLE & EMOTIONAL LABOUR",
    triggers: ["1:1", "one on one", "performance review", "layoff", "termination", "hr review", "hr meeting"],
    selfRegulationFocus: "Internal Buffer — emotional regulation under empathy load",
  },
  C: {
    id: "C", name: "STRATEGIC DECISION",
    triggers: ["strategy", "decision", "deal", "negotiation", "term sheet", "offsite"],
    selfRegulationFocus: "Decision Power — clarity over speed",
  },
  D: {
    id: "D", name: "EXTERNAL VISIBILITY",
    triggers: ["keynote", "press", "media", "podcast", "interview", "panel", "stage"],
    selfRegulationFocus: "Executive Presence under broadcast load",
  },
  E: {
    id: "E", name: "DEEP WORK & CREATION",
    triggers: ["deep work", "writing", "design review", "architecture", "focus block"],
    selfRegulationFocus: "Mental Bandwidth — protected attention",
  },
  F: {
    id: "F", name: "TRAVEL & TIME-ZONE TRANSITION",
    triggers: ["flight", "travel", "airport", "redeye"],
    selfRegulationFocus: "Operational Drive — circadian re-entry",
  },
  G: {
    id: "G", name: "TEAM RHYTHM & OPERATIONAL",
    triggers: ["standup", "team meeting", "review", "weekly", "all hands", "syncing"],
    selfRegulationFocus: "Operational Drive — sustained low-grade output",
  },
  H: {
    id: "H", name: "DAILY RHYTHM & RECOVERY",
    triggers: ["lunch", "break", "commute", "evening", "recovery"],
    selfRegulationFocus: "Physical Recovery — buffer reconstruction",
  },
};

const STAKES_TO_CATEGORY: Record<string, EventCategoryId> = {
  board: "A", external: "A", investor: "A",
};

/**
 * Classify a calendar event into one of the 8 CEO pillars.
 * `stakesLevel` overrides title matching when set (e.g. an event tagged
 * `board` is always Category A even if the title is "Coffee").
 */
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