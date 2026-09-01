// OWNERSHIP: coaching (vocabulary), engineering (enforcement).
//
// SSOT for the Today's-3 copy contract: what the TITLE says, what the WHY
// says, and the rules that keep them from overlapping. Consumed by:
//   • the deterministic builder in generate-mastery-plan
//   • the Why-line LLM prompt (`why-llm.ts`)
//   • the Why-line validator
//
// TITLE — what this slot is and how it helps.
//   {role verb} {executive outcome} {connector} {anchor}
//   ≤8 words, no metric, no number, no practice name.
// WHY — the evidence that earns the slot.
//   One clause, ≤15 words, states the signal, never an instruction.

import type { EventCategoryId } from "../events/event-categories.ts";

/** Proactive role the app is playing in this slot. */
export type SlotRole = "Protect" | "Prevent" | "Prepare" | "Build";

/** Valence of the winning evidence item. */
export type EvidenceValence = "positive" | "risk" | "strategic" | "neutral";

/** Executive outcomes — states, never practice mechanics. */
export const EXECUTIVE_OUTCOMES = [
  "composure",
  "composed presence",
  "decision quality",
  "presence",
  "focus",
  "recovery",
  "resilience",
  "clarity",
  "your edge",
] as const;

export const TITLE_WORD_CAP = 8;
export const WHY_WORD_CAP = 15;

/** Valence → proactive role. `hasAnchor=false` demotes Prepare to Build. */
export function roleFromValence(
  valence: EvidenceValence,
  hasAnchor: boolean,
): SlotRole {
  if (valence === "positive") return "Protect";
  if (valence === "risk") return "Prevent";
  if (valence === "strategic") return hasAnchor ? "Prepare" : "Build";
  return hasAnchor ? "Prepare" : "Build";
}

/**
 * Outcome the slot protects/prevents/builds, chosen from the anchor category
 * and role. Always an executive state.
 */
export function outcomeForRole(
  role: SlotRole,
  categoryId: EventCategoryId | null,
): string {
  if (role === "Protect") {
    switch (categoryId) {
      case "A":
      case "B":
      case "C":
      case "F":
        return "your edge";
      case "D":
        return "composure";
      case "E":
        return "focus";
      case "G":
        return "recovery";
      default:
        return "your edge";
    }
  }
  if (role === "Prevent") {
    switch (categoryId) {
      case "A":
      case "B":
      case "F":
        return "composure drain";
      case "C":
        return "presence drain";
      case "D":
        return "emotional spillover";
      case "E":
        return "decision drift";
      case "G":
        return "travel fatigue";
      default:
        return "decision drift";
    }
  }
  if (role === "Prepare") {
    switch (categoryId) {
      case "A":
        return "decision quality";
      case "B":
      case "C":
      case "F":
        return "presence";
      case "D":
        return "composure";
      case "E":
        return "focus";
      case "G":
        return "recovery";
      default:
        return "presence";
    }
  }
  // Build — no anchor.
  return "resilience";
}

function connectorFor(
  role: SlotRole,
  phase: "pre" | "during" | "post" | null,
): string {
  if (phase === "post") return "after";
  if (phase === "during") return "through";
  if (role === "Protect") return "into";
  return "before";
}

function shrink(raw: string, maxTokens: number): string {
  const cleaned = String(raw || "").replace(/[\(\)\[\]"]/g, " ").replace(
    /\s+/g,
    " ",
  ).trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ");
  if (tokens.length <= maxTokens) return tokens.join(" ");
  return [...tokens.slice(0, maxTokens - 1), tokens[tokens.length - 1]].join(
    " ",
  );
}

export interface ContractTitleInput {
  role: SlotRole;
  outcome: string;
  anchorTitle: string | null;
  categoryId: EventCategoryId | null;
  phase: "pre" | "during" | "post" | null;
  isTomorrow?: boolean;
  /** morning | afternoon | evening — used for the light-day ladder. */
  timeOfDay?: "morning" | "afternoon" | "evening" | null;
  /** True when the day carries no selected high-stakes event. */
  lightDay?: boolean;
  /**
   * Titles already used by earlier slots today. Unanchored slots fall down an
   * alternate ladder rather than repeating a sibling word-for-word.
   */
  avoidTitles?: string[];
}

/** Unanchored ladders, in order of preference, per role + window. */
function unanchoredLadder(
  role: SlotRole,
  outcome: string,
  win: "morning" | "afternoon" | "evening" | null,
): string[] {
  if (role === "Build") {
    return win === "evening"
      ? [
        "Build recovery for tomorrow",
        "Bank capacity for tomorrow",
        "Build the base tomorrow runs on",
      ]
      : [
        "Build resilience for high-demand days",
        "Build capacity before the load returns",
        "Widen your margin for heavy days",
      ];
  }
  if (role === "Protect") {
    return win === "evening"
      ? [
        "Protect recovery tonight",
        "Protect the night's recovery",
        "Hold recovery through the evening",
      ]
      : [`Protect ${outcome}`, `Hold ${outcome} where it is`, `Keep ${outcome} intact`];
  }
  if (role === "Prevent") {
    return win === "evening"
      ? [
        "Prevent the day carrying over",
        "Stop the day following you home",
        "Close the day before it carries",
      ]
      : [`Prevent ${outcome}`, `Head off ${outcome}`, `Cut ${outcome} early`];
  }
  if (win === "morning") {
    return [
      "Set your focus for the morning",
      "Set the tone before the morning starts",
      `Prepare ${outcome} for the morning`,
    ];
  }
  if (win === "afternoon") {
    return [
      "Hold your focus through the afternoon",
      "Carry your focus into the afternoon",
      `Prepare ${outcome} for the afternoon`,
    ];
  }
  return [
    `Prepare ${outcome} for what's ahead`,
    `Get ${outcome} ready for what's next`,
    `Set up ${outcome} before it's needed`,
  ];
}

/**
 * Deterministic contract title. Anchored slots name the event; light days use
 * the outcome ladder ("Protect recovery", "Set your focus for the morning").
 * Sibling slots never repeat a title: `avoidTitles` walks the ladder on.
 */
export function buildContractTitle(input: ContractTitleInput): string {
  const { role, outcome } = input;
  const anchor = (input.anchorTitle || "").trim();
  const taken = new Set(
    (input.avoidTitles || []).map((t) => String(t || "").trim().toLowerCase()),
  );

  if (!anchor) {
    const ladder = unanchoredLadder(role, outcome, input.timeOfDay ?? null);
    return ladder.find((t) => !taken.has(t.toLowerCase())) ?? ladder[0];
  }

  const connector = connectorFor(role, input.phase ?? null);
  const article = input.isTomorrow ? "tomorrow's" : "the";
  const words = (s: string) => s.split(" ").filter(Boolean).length;
  const assemble = (bits: (string | null | undefined)[]) =>
    bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  let out = assemble([role, outcome, connector, article, shrink(anchor, 3)]);
  if (words(out) > TITLE_WORD_CAP) {
    out = assemble([role, outcome, connector, article, shrink(anchor, 2)]);
  }
  if (words(out) > TITLE_WORD_CAP) {
    out = assemble([role, connector, article, shrink(anchor, 2)]);
  }
  if (words(out) > TITLE_WORD_CAP) {
    out = out.split(" ").slice(0, TITLE_WORD_CAP).join(" ");
  }
  return out;
}

const TITLE_BANNED = /\b(practice|protocol|session|module|score|hrv|rhr)\b/i;

/** Title contract check — shape only, never rewrites. */
export function validateTitleContract(
  title: string,
): { ok: true } | { ok: false; reason: string } {
  const t = String(title || "").trim();
  if (!t) return { ok: false, reason: "empty" };
  if (t.split(/\s+/).length > TITLE_WORD_CAP) {
    return { ok: false, reason: "too_long" };
  }
  if (/\d/.test(t)) return { ok: false, reason: "contains_metric" };
  if (TITLE_BANNED.test(t)) return { ok: false, reason: "practice_mechanic" };
  return { ok: true };
}

const WHY_INSTRUCTION = /:\s*\p{L}/u;

/**
 * Why contract check — one clause, no instruction tail, no title echo, no
 * practice name. Deliberately shape-only; evidence truth is upstream.
 */
export function validateWhyContract(
  why: string,
  opts: { title?: string | null; practiceTitle?: string | null } = {},
): { ok: true } | { ok: false; reason: string } {
  const raw = String(why || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > WHY_WORD_CAP + 5) return { ok: false, reason: "too_long" };
  // Stacked facts: more than one terminal sentence.
  const sentences = raw.split(/[.!?]+\s+/).filter((s) => s.trim().length > 1);
  if (sentences.length > 1) return { ok: false, reason: "stacked" };
  if (WHY_INSTRUCTION.test(raw)) return { ok: false, reason: "instruction_tail" };
  const practice = (opts.practiceTitle || "").toLowerCase().trim();
  if (practice && practice.length > 4 && raw.toLowerCase().includes(practice)) {
    return { ok: false, reason: "names_practice" };
  }
  const title = (opts.title || "").toLowerCase();
  if (title) {
    const roleVerb = title.split(/\s+/)[0];
    if (roleVerb && new RegExp(`\\b${roleVerb}\\b`, "i").test(raw)) {
      return { ok: false, reason: "echoes_title_verb" };
    }
  }
  return { ok: true };
}

/** Prompt-side statement of the same contract (LLM + validator parity). */
export const COPY_CONTRACT_BLOCK = [
  `=== COPY CONTRACT (title vs why) ===`,
  `The card already shows a TITLE that states WHAT this slot is and HOW it helps, in the shape "{Protect|Prevent|Prepare|Build} {executive outcome} {before|into|through|after} {event}".`,
  `You are writing the WHY. Your only job is the EVIDENCE that earns the slot.`,
  `- One sentence, one clause, ${WHY_WORD_CAP} words or fewer.`,
  `- State the signal. Never give an instruction, never use a colon-instruction tail.`,
  `- Never repeat the title's verb or outcome. Never name the practice. Never tell them what to do.`,
  `- QUANTIFY. Carry a number from the evidence — a reading ("58bpm against a 54bpm baseline"), a percentage ("recovery 14% below baseline"), a count ("your last three board meetings"), or a score ("clarity at 2 out of 5").`,
  `- If the evidence carries no number, name the leader's own words instead — the goal, stake or drain they declared. Never write a vague claim with neither.`,
  `- Never invent a number. Only numbers present in the evidence block may appear.`,
  ``,
  `Worked examples (title → why):`,
  `- "Prevent composure drain before Board Meeting" → "Elevated heart rate before your last three board meetings."`,
  `- "Protect your edge into the Board Meeting" → "Recovery is 18% above your baseline going in."`,
  `- "Prepare presence for the Investor Call" → "You flagged investor calls as your biggest drain."`,
  `- "Prevent decision drift across the afternoon" → "Six meetings back-to-back with clarity at 2 out of 5."`,
  `- "Protect recovery" → "Resting heart rate is 58bpm against a 54bpm baseline."`,
  `- "Build resilience for high-demand days" → "Early days — this is the base your harder weeks run on."`,
].join("\n");
