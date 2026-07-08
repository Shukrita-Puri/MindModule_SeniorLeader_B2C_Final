// OWNERSHIP: engineering. Lovable AI Gateway call that writes the per-priority
// "Why this matters" line for Today's 3 Priorities.
//
// Contract: the Plan owns the "how do I improve my readiness?" justification.
// The Brief orients (state + how to carry it); the Plan justifies one move at
// a time. State band is sourced off the SAME `shared.briefBehaviour` snapshot
// that drives the MRS dial and the Brief — never re-banded here. The
// `validateWhyLine` helper enforces asymmetric grounding + a narrow valence
// gate; callers fall through to the deterministic repair path on rejection.

import type { EventCategoryId } from "../events/event-categories.ts";
import { EVENT_CATEGORIES } from "../events/event-categories.ts";
import { EVENT_PHASE_MAP, type Phase } from "../events/event-phase-map.ts";
import {
  CHIEF_OF_STAFF_PERSONA,
  FORBIDDEN_NOTIFICATION_WORDS,
} from "../copy-vocabulary.ts";
import type { SlotAnchor, TitleRole } from "./title-prefixes.ts";
import { relativeEventPhrase } from "../text/sanitise.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/**
 * Hard request timeout for the Why-line LLM call. Spec-mandated 10s. When
 * the fetch exceeds this budget it is aborted and callers fall back to the
 * deterministic repair path in `generate-mastery-plan`.
 */
const WHY_LLM_TIMEOUT_MS = 10_000;

/** Canonical state-band union — same vocabulary the Brief uses. */
export type StateBand = "firing" | "sharp" | "steady" | "stretched" | "depleted";

/** Arc position derived from `jitPhase`. */
export type ArcPosition = "prepare" | "during" | "recover" | "standalone";

export interface WhyLLMInput {
  role: TitleRole;
  eventName: string;
  category: EventCategoryId;
  phase: Phase;
  minutesUntilStart: number | null;

  // signals — pass null when unavailable; the prompt skips nulls.
  hrvDeltaPct: number | null;
  sleepScore: number | null;
  rhrTrend: "elevated" | "normal" | "low" | null;
  travelDebtActive: boolean | null;
  stressLoad: "low" | "medium" | "high" | null;
  burnoutRisk: "none" | "emerging" | "active" | null;
  mindState: number | null;
  bodyState: number | null;
  patternSummary: string | null;

  growthIntention: string | null;

  // Shared-module advisories (Brief↔Plan parity).
  ceoBehaviourBlock?: string | null;
  eventTaxonomyBlock?: string | null;
  briefEcho?: string | null;
  todaysOtherWhyLines?: string[];

  // Shared state band + slot identity (Plan-only Why-line contract).
  /**
   * Server-computed band off the same `shared.briefBehaviour` snapshot that
   * drives the MRS dial and the Brief. NEVER re-banded. `null` when the
   * snapshot is missing — prompt drops the band-discipline block and the
   * validator skips the valence gate.
   */
  stateBand?: StateBand | null;
  /** Mapped from `jitPhase` — pre→prepare, during→during, post→recover, otherwise→standalone. */
  arcPosition?: ArcPosition;
  /** Slot-scoped anchor identity (same object handed to the title builder). */
  slotAnchor?: SlotAnchor;
  /** Practice display title for the slot (used in the prompt's PRACTICE block). */
  practiceTitle?: string | null;
  /** Protocol combo label (e.g. "regulate → align"); optional. */
  protocolCombo?: string | null;
  /** Local-time offset in minutes (Date#getTimezoneOffset convention). */
  timezoneOffsetMinutes?: number;
  /** Event start in epoch ms — used to render the "When" phrase. */
  eventStartMs?: number | null;

  // ── Sprint E — window signals (reused from Sprint D derivation). Only
  // added to the prompt when explicitly true / non-null. Missing / false
  // keys are dropped so the LLM never sees inverted signals.
  /** Afternoon/evening: check-in clarity is reading low → protect composure. */
  decisionLeakageRisk?: boolean;
  /** Evening: sustained HRV depression → body load elevated. */
  bodyLoadElevated?: boolean;
  /** Evening: genuine recovery signal ('rest' most common; others rare). */
  recoveryNote?: 'rest' | 'light' | 'normal' | null;
  /** Body ↔ subjective divergence flag. Left null when not safely derivable. */
  vetoRisk?: boolean;
}

interface GatewayToolArgs {
  statement?: string;
}

interface GatewayChoiceMessage {
  content?: string;
  tool_calls?: Array<{ function?: { arguments?: string | GatewayToolArgs } }>;
}

interface GatewayResponse {
  choices?: Array<{ message?: GatewayChoiceMessage }>;
}

// ════════════════════════════════════════════════════════════════════════
// Helpers — band mapping, arc mapping, anchor tokens, regexes.
// ════════════════════════════════════════════════════════════════════════

/**
 * Map the Plan's existing `innerReadinessTier` vocabulary
 * (`peak | strong | managing | depleted`) to the canonical `StateBand`
 * union. Returns null when the tier is missing or unrecognised so the
 * prompt/validator can degrade gracefully (no fabricated band).
 */
export function tierToStateBand(tier: string | null | undefined): StateBand | null {
  switch ((tier || "").toLowerCase()) {
    case "peak": return "firing";
    case "strong": return "sharp";
    case "managing": return "steady";
    case "depleted": return "depleted";
    // Forward-compat: accept canonical band names directly.
    case "firing": case "sharp": case "steady": case "stretched":
      return (tier as StateBand);
    default: return null;
  }
}

/**
 * Map a `jitPhase` (or missing/unknown) to the arc-position vocabulary.
 * Defaults to `standalone` for any unknown value so future phase names
 * never crash this layer.
 */
export function arcPositionFromPhase(
  phase: Phase | "pre" | "during" | "post" | null | undefined,
): ArcPosition {
  if (phase === "pre") return "prepare";
  if (phase === "during") return "during";
  if (phase === "post") return "recover";
  return "standalone";
}

/**
 * Per-category alias tokens — what people naturally call these events when
 * the literal title omits a generic noun (e.g. "1:1 with Sarah" → the LLM
 * may say "conversation"; this lets the validator still ground it).
 */
const EVENT_TYPE_ALIASES: Record<EventCategoryId, string[]> = {
  A: ["board", "meeting", "governance", "session"],
  B: ["pitch", "client", "presentation", "talk", "call"],
  C: ["call", "interview", "media", "talk"],
  D: ["1:1", "feedback", "conversation", "review", "talk"],
  E: ["deep", "focus", "block", "strategy", "work"],
  F: ["conference", "keynote", "panel", "event"],
  G: ["flight", "travel", "trip", "transit"],
  H: ["routine", "day", "check-in"],
};

const ANCHOR_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "with", "for", "of", "to",
  "in", "on", "at", "your", "my", "this", "that", "into",
  "from", "by", "as", "is",
]);

/**
 * Forgiving tokenizer for the slot's anchor title. Keeps `1:1`-style
 * compound tokens, drops short stopwords, and folds in the category aliases
 * + self-regulation focus words so phrasing like "conversation" / "session"
 * still grounds against a literal "1:1 with Sarah".
 */
export function anchorTokens(title: string, categoryId: EventCategoryId | null): Set<string> {
  const out = new Set<string>();
  const raw = String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !ANCHOR_STOPWORDS.has(t));
  for (const t of raw) out.add(t);
  if (categoryId && EVENT_TYPE_ALIASES[categoryId]) {
    for (const t of EVENT_TYPE_ALIASES[categoryId]) out.add(t);
  }
  if (categoryId) {
    const focus = (EVENT_CATEGORIES[categoryId]?.selfRegulationFocus || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !ANCHOR_STOPWORDS.has(t));
    for (const t of focus) out.add(t);
  }
  return out;
}

const STATE_TOKEN_REGEX: Record<StateBand, RegExp> = {
  firing: /\b(sharp|firing|clear|edge|locked in|on form|dialed in|in flow|switched on)\b/i,
  sharp: /\b(sharp|firing|clear|edge|locked in|on form|dialed in|in flow|switched on)\b/i,
  steady: /\b(steady|holding|on track|even|calm|settled|on pace|in rhythm)\b/i,
  stretched: /\b(low|running low|reserves|stretched|tired|drained|behind|thin|running on fumes|worn|heavy|foggy)\b/i,
  depleted: /\b(low|running low|reserves|stretched|tired|drained|behind|thin|running on fumes|worn|heavy|foggy)\b/i,
};

const VALENCE_REJECT_FIRING = /\b(recover|recovery|recharge|wind down|come down|refill|rest up|unwind|ease off|ramp down)\b/i;
const VALENCE_REJECT_DEPLETED = /\b(push|sprint|spend the edge|go harder|lean in|grind|power through|dig in)\b/i;

/**
 * Soft word-count ceiling for the Why-line. The prompt asks for one
 * sentence, but the validator must enforce it so paragraph-length LLM
 * output falls through to the deterministic repair path instead of
 * reaching the card.
 */
const MAX_WHY_LINE_WORDS = 35;

export type ValidatorReject =
  | "generic"
  | "valence_firing_recovery"
  | "valence_depleted_push"
  | "jaccard_dup"
  | "too_long"
  | "empty";

export interface ValidateWhyLineInput {
  text: string | null | undefined;
  stateBand: StateBand | null;
  slotAnchor: SlotAnchor | null;
  /** Previously accepted lines in this generation pass, used for dedupe gating. */
  priorAccepted?: { text: string; slotAnchor: SlotAnchor | null; arcPosition: ArcPosition | null }[];
  /** Earlier why-lines already emitted today, used for same-day repetition checks. */
  sameDayAccepted?: { text: string }[];
  /** Arc position of the candidate (used for dedupe gating). */
  arcPosition?: ArcPosition | null;
}

export type ValidateWhyLineResult =
  | { ok: true; anchorTokensUsed: boolean }
  | { ok: false; reason: ValidatorReject };

/**
 * Asymmetric, deliberately forgiving validator. Rejects only on clear
 * contradictions; stylistic variance is left to telemetry + downstream
 * monitoring. Fail-closed cases hand off to the deterministic repair path
 * already living in `generate-mastery-plan`.
 */
export function validateWhyLine(inp: ValidateWhyLineInput): ValidateWhyLineResult {
  const raw = (inp.text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  const lower = raw.toLowerCase();

  // 0. Word-count ceiling — reject paragraph-length output. Prefer reject +
  // deterministic fallback over silent truncation.
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WHY_LINE_WORDS) {
    return { ok: false, reason: "too_long" };
  }

  // 1. Anchor / state grounding (asymmetric — either anchor OR state grounds).
  const anchorSet = inp.slotAnchor?.eventTitle
    ? anchorTokens(inp.slotAnchor.eventTitle, inp.slotAnchor.categoryId ?? null)
    : new Set<string>();
  const hasAnchor = anchorSet.size > 0 && [...anchorSet].some((tok) => lower.includes(tok));
  let hasState = false;
  if (inp.stateBand) {
    const re = STATE_TOKEN_REGEX[inp.stateBand];
    hasState = re ? re.test(raw) : false;
  }
  if (!hasAnchor && !hasState) {
    return { ok: false, reason: "generic" };
  }

  // 2. Valence gate (only when band is known).
  if (inp.stateBand === "firing" || inp.stateBand === "sharp") {
    if (VALENCE_REJECT_FIRING.test(raw)) {
      return { ok: false, reason: "valence_firing_recovery" };
    }
  }
  if (inp.stateBand === "depleted" || inp.stateBand === "stretched") {
    if (VALENCE_REJECT_DEPLETED.test(raw)) {
      return { ok: false, reason: "valence_depleted_push" };
    }
  }

  // 3. Dedupe — gated to same event + same arc only.
  if (inp.priorAccepted && inp.priorAccepted.length > 0) {
    const ownEvt = (inp.slotAnchor?.eventTitle || "").toLowerCase().trim();
    const ownArc = inp.arcPosition ?? null;
    if (ownEvt) {
      for (const prior of inp.priorAccepted) {
        const priorEvt = (prior.slotAnchor?.eventTitle || "").toLowerCase().trim();
        const priorArc = prior.arcPosition ?? null;
        if (priorEvt === ownEvt && priorArc === ownArc && jaccard(prior.text, raw) > 0.85) {
          return { ok: false, reason: "jaccard_dup" };
        }
      }
    }
  }

  if (inp.sameDayAccepted && inp.sameDayAccepted.length > 0) {
    for (const prior of inp.sameDayAccepted) {
      if (jaccard(prior.text, raw) > 0.8) {
        return { ok: false, reason: "jaccard_dup" };
      }
    }
  }

  return { ok: true, anchorTokensUsed: hasAnchor };
}

// ════════════════════════════════════════════════════════════════════════
// Prompt construction
// ════════════════════════════════════════════════════════════════════════

function buildBandDirective(band: StateBand): string {
  if (band === "firing" || band === "sharp") {
    return `Band is ${band} — frame the practice as staying sharp / holding the edge / sustaining focus. Do NOT use recovery verbs (recover, recovery, recharge, wind down, come down, refill, rest up).`;
  }
  if (band === "depleted" || band === "stretched") {
    return `Band is ${band} — say plainly that this move is how the leader gets ready for what's ahead. Protection and recovery framing is correct. Do NOT use push verbs (push, sprint, spend the edge, go harder, lean in, grind).`;
  }
  return `Band is steady — either focus or protection framing is fine; let the event and the practice decide.`;
}

function arcDirectiveFor(arc: ArcPosition): string {
  switch (arc) {
    case "prepare": return `Arc: PREPARE — frame this as setting up for the event ahead.`;
    case "during": return `Arc: DURING — frame this as holding steady through the event.`;
    case "recover": return `Arc: RECOVER — frame this as closing cleanly after the event so the charge doesn't carry.`;
    case "standalone": return `Arc: STANDALONE — no specific event arc; justify by the day's state and what this protects or builds.`;
  }
}

function pickRelevantSignalPhrases(inp: WhyLLMInput): string[] {
  const out: string[] = [];
  if (inp.sleepScore !== null && inp.sleepScore < 65) out.push(`sleep ran short (${inp.sleepScore}/100)`);
  if (inp.hrvDeltaPct !== null && Math.abs(inp.hrvDeltaPct) >= 10) {
    out.push(inp.hrvDeltaPct < 0
      ? `recovery is down ~${Math.abs(inp.hrvDeltaPct)}%`
      : `recovery is running ~${inp.hrvDeltaPct}% above baseline`);
  }
  if (inp.rhrTrend === "elevated") out.push(`resting HR is elevated`);
  if (inp.mindState !== null && inp.mindState <= 2) out.push(`clarity is reading low`);
  if (inp.bodyState !== null && inp.bodyState <= 2) out.push(`body energy is reading low`);
  if (inp.travelDebtActive) out.push(`travel debt is active`);
  if (inp.patternSummary) out.push(inp.patternSummary);
  if (!out.length) out.push(`no single dominant signal`);
  return out.slice(0, 3);
}

/**
 * Sprint E — extra Window-signal lines rendered inside the STATE block.
 * ONLY non-null / true fields are emitted. Missing keys are silently
 * dropped so the LLM never sees inverted or fabricated signals. Kept as
 * an exported helper so the deterministic path can reuse the same
 * decision matrix if needed.
 */
export function buildWindowSignalLines(inp: WhyLLMInput): string[] {
  const lines: string[] = [];
  if (inp.decisionLeakageRisk === true) {
    lines.push(`Window signal: decision leakage risk present`);
  }
  if (inp.bodyLoadElevated === true) {
    lines.push(`Window signal: body load elevated`);
  }
  if (inp.recoveryNote != null) {
    lines.push(`Window signal: evening recovery note: ${inp.recoveryNote}`);
  }
  if (inp.vetoRisk === true) {
    lines.push(`Window signal: veto risk present`);
  }
  return lines;
}

function formatMinutesUntil(min: number): string {
  if (min < 0) return `${Math.round(-min / 60)}h ago`;
  if (min < 60) return `in ${Math.max(1, Math.round(min))}m`;
  if (min < 60 * 24) return `in ${Math.round(min / 60)}h`;
  return `in ${Math.round(min / 60 / 24)}d`;
}

function buildPrompt(inp: WhyLLMInput): string {
  const cat = EVENT_CATEGORIES[inp.category];
  const ph = EVENT_PHASE_MAP[inp.category]?.[inp.phase];
  const categoryLabel = cat ? `${inp.category} — ${cat.name}` : inp.category;
  const selfReg = cat?.selfRegulationFocus || "";
  const preventsBuilds = (ph?.preventsBuilds || []).join("; ");

  const signals: string[] = [];
  if (inp.hrvDeltaPct !== null) signals.push(`- HRV vs baseline: ${inp.hrvDeltaPct}%`);
  if (inp.sleepScore !== null) signals.push(`- Sleep score last night: ${inp.sleepScore}/100`);
  if (inp.rhrTrend) signals.push(`- RHR trend: ${inp.rhrTrend}`);
  if (inp.travelDebtActive !== null) signals.push(`- Travel debt active: ${inp.travelDebtActive}`);
  if (inp.stressLoad) signals.push(`- Stress load: ${inp.stressLoad}`);
  if (inp.burnoutRisk) signals.push(`- Burnout risk: ${inp.burnoutRisk}`);
  if (inp.mindState !== null) signals.push(`- Self-declared mind state: ${inp.mindState}/5`);
  if (inp.bodyState !== null) signals.push(`- Self-declared body state: ${inp.bodyState}/5`);
  if (inp.patternSummary) signals.push(`- Pattern data: ${inp.patternSummary}`);

  const strategic = inp.growthIntention
    ? `\nStrategic context (use only if directly relevant to this event):\n- Growth intention: ${inp.growthIntention}`
    : "";

  const sharedAdvisory = [
    (inp.eventTaxonomyBlock || "").trim(),
    (inp.ceoBehaviourBlock || "").trim(),
  ].filter(Boolean).join("\n");

  const band = inp.stateBand ?? null;
  const bandBlock = band
    ? buildBandDirective(band)
    : `(no shared band available — ground in the event + the practice; do not invent a band)`;

  const arc = inp.arcPosition ?? "standalone";
  const arcDirective = arcDirectiveFor(arc);

  const signalPhrases = pickRelevantSignalPhrases(inp);
  const signalPhrase = signalPhrases[0] ?? "no single dominant signal";
  const practice = (inp.practiceTitle || "").trim() || "this practice";
  const protocol = (inp.protocolCombo || "").trim() || "(single-step)";
  const forbiddenCopy = FORBIDDEN_NOTIFICATION_WORDS.join(", ");

  const evtTitle = inp.slotAnchor?.eventTitle || inp.eventName || "";
  const evtCatId = inp.slotAnchor?.categoryId || inp.category || null;
  const evtCatLabel = evtCatId
    ? `${evtCatId} — ${EVENT_CATEGORIES[evtCatId as EventCategoryId]?.name ?? ""}`
    : categoryLabel;
  const whenPhrase = (inp.eventStartMs && Number.isFinite(inp.eventStartMs))
    ? relativeEventPhrase({
        startMs: inp.eventStartMs!,
        nowMs: Date.now(),
        timezoneOffsetMinutes: inp.timezoneOffsetMinutes ?? 0,
      })
    : (inp.minutesUntilStart !== null ? formatMinutesUntil(inp.minutesUntilStart) : "unknown");

  const hasAnchor = !!(evtTitle && evtTitle.trim());
  const eventBlock = hasAnchor
    ? [
        `=== THE EVENT ===`,
        `Event: ${evtTitle}`,
        `Category: ${evtCatLabel}`,
        `When: ${whenPhrase}`,
        `Why it's a moment: ${preventsBuilds || selfReg || "high-leverage moment for this leader"}`,
      ].join("\n")
    : `=== ELSE (no event anchor) ===\nState-management practice — justify by the day's state, not a calendar moment.`;

  const stateBlock = [
    `=== STATE ===`,
    band ? `Band: ${band}  (match; do not name)` : `Band: unknown  (do not invent a band)`,
    `Most relevant signal: ${signalPhrase}`,
    ...buildWindowSignalLines(inp),
  ].join("\n");

  const practiceBlock = [
    `=== THIS PRACTICE ===`,
    `Practice: ${practice}`,
    `Protocol combo: ${protocol}`,
    `Arc position: ${arc}`,
  ].join("\n");

  const signalsAvailable = signals.length
    ? `Available signals (reference whichever are most relevant — do not mention null fields):\n${signals.join("\n")}`
    : `Available signals: none — reference the event itself and the day's state.`;
  const relevantSignalsBlock = signalPhrases.length
    ? `Most relevant signals:\n${signalPhrases.map((s) => `- ${s}`).join("\n")}`
    : `Most relevant signals: none`;
  const briefEchoBlock = (inp.briefEcho || "").trim()
    ? `\nBrief echo (use only if it directly sharpens the why-line; never copy verbatim):\n${inp.briefEcho!.trim()}`
    : "";
  const repetitionGuardBlock = inp.todaysOtherWhyLines && inp.todaysOtherWhyLines.length
    ? `\nToday's other why-lines (do not repeat their core message):\n${inp.todaysOtherWhyLines.map((line) => `- ${line}`).join("\n")}`
    : "";

  return [
    `${CHIEF_OF_STAFF_PERSONA}`,
    ``,
    `You are writing the one-line reason a specific practice has been placed in their plan today.`,
    ``,
    `You are not the Brief. The Brief already gave the read on how today feels and how to carry themselves. Your job now is narrower and more concrete: explain, in one human sentence, why THIS practice, for THIS event, RIGHT NOW. You are the person who put the move on their schedule and is telling them why it earns its place.`,
    ``,
    `HOW YOU SPEAK`,
    `- Like a sharp, warm, senior chief of staff who just handed the leader something and is saying "here's why" — plain, confident, specific.`,
    `- You connect the dots out loud: their state + what's ahead + what this move does about it. That connection IS the value.`,
    `- Plain executive English. The way a person explains a decision, not the way a system labels a task.`,
    `- Read the Brief as background, but do not restate it unless it directly explains this exact practice.`,
    ``,
    `THREE-PART CONNECTION (aim for all three — state + event + reason)`,
    `1. STATE — where the leader is right now.`,
    `2. EVENT — the specific upcoming or just-finished event this move is tied to (omit if no anchor).`,
    `3. REASON — what this practice does about (1) in service of (2).`,
    ``,
    `STATE-BAND DISCIPLINE`,
    bandBlock,
    ``,
    `ARC AWARENESS`,
    arcDirective,
    ``,
    `HARD CONSTRAINTS`,
    `- One sentence. The practice title carries the "what"; you carry the "why".`,
    `- Never use wellness words (recharge, self-care, mindful, breathe, nourish, restore, wellness, journey, calm, relax) or clinical jargon (parasympathetic, cortisol, sympathetic).`,
    `- Shared forbidden notification words also apply here: ${forbiddenCopy}.`,
    `- Never name the score, the band, or the state-band word — imply the state in plain words.`,
    `- Never mention band mechanics, scores, or the internal plan system.`,
    `- Never use abstract system phrases ("optimise the window", "hold the base", "for your state"). If a real chief of staff wouldn't say it out loud handing over a task, rewrite it.`,
    `- Never tell the user how to raise their score directly — you justify ONE move; naming the score-raising action set is the plan-as-a-whole's job.`,
    ``,
    stateBlock,
    ``,
    practiceBlock,
    ``,
    eventBlock,
    ``,
    relevantSignalsBlock,
    briefEchoBlock,
    repetitionGuardBlock,
    signalsAvailable,
    strategic,
    sharedAdvisory ? `\n${sharedAdvisory}\nWhen the active behaviours above name this exact event, prefer aligning the statement to that anchor — do not echo any copyHint verbatim.` : ``,
    ``,
    `OUTPUT — plain text, one sentence. No markdown, no asterisks, no preamble. Return only the why-line string.`,
  ].join("\n");
}

export function trimToWords(s: string, max = 25): string {
  const clean = (s || "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  const words = clean.split(/\s+/);
  if (words.length <= max) return clean;
  const head = words.slice(0, max).join(" ");
  return head.replace(/[,;:.\-—\s]+$/, "") + ".";
}

/**
 * Calls Lovable AI Gateway. Returns trimmed statement or null on failure /
 * missing key / too-short response. Caller decides fallback path.
 */
export async function generateWhyStatement(inp: WhyLLMInput): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WHY_LLM_TIMEOUT_MS);
  try {
    const prompt = buildPrompt(inp);
    const tool = {
      type: "function",
      function: {
        name: "write_why",
        description: "Write the one-sentence Why This Matters line.",
        parameters: {
          type: "object",
          properties: {
            statement: { type: "string", description: "One sentence. Chief-of-staff voice. Grounds in event + state." },
            role: { type: "string", enum: ["PREVENT", "PREPARE"] },
          },
          required: ["statement", "role"],
          additionalProperties: false,
        },
      },
    };
    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "write_why" } },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn("[why-llm] gateway error", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json() as GatewayResponse;
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let statement: string | null = null;
    if (typeof args === "string") {
      try { statement = JSON.parse(args)?.statement ?? null; } catch { statement = null; }
    } else if (args && typeof args === "object") {
      statement = "statement" in args && typeof args.statement === "string" ? args.statement : null;
    }
    if (!statement) {
      const direct = data?.choices?.[0]?.message?.content;
      if (typeof direct === "string" && direct.trim()) statement = direct.trim();
    }
    if (!statement) return null;
    const trimmed = trimToWords(statement, 30);
    if (trimmed.split(/\s+/).length < 5) return null;
    return trimmed;
  } catch (e: unknown) {
    if ((e as any)?.name === "AbortError") {
      console.warn(`[why-llm] gateway timeout after ${WHY_LLM_TIMEOUT_MS}ms`);
      return null;
    }
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[why-llm] failed", message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Jaccard similarity over lowercase token sets — used for dedupe. */
export function jaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
