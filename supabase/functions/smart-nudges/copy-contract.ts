// ─────────────────────────────────────────────────────────────────────────────
// Smart Nudges — V8 copy contract validation
//
// Extracted from index.ts so the deterministic fallback bank and its tests
// can share the same quality gate without importing the full edge-function
// entrypoint.
// ─────────────────────────────────────────────────────────────────────────────

import { FORBIDDEN_NOTIFICATION_WORDS } from "../_shared/copy-vocabulary.ts";
import {
  containsGenericCostSuffix,
  type MetricKind,
  validateMetricPolarityInCopy,
} from "../_shared/nudges/metric-polarity.ts";
import {
  type EventPhase,
  validateEventPhaseInCopy,
} from "../_shared/nudges/event-phase.ts";

export interface CopyContractCheckCtx {
  todayEvents: Array<{ title?: string | null }>;
  tomorrowEvents: Array<{ title?: string | null }>;
  highStakesEvents: Array<{ title?: string | null }>;
  firstNonNoiseEvent?: { title?: string | null } | null;
  morningCheckinOutcome?: string | null;
}

export interface TruthContractCheckCtx {
  morningCheckinOutcome?: string | null;
  wearable: {
    rhr: number | null;
    rhrBaseline30d: number | null;
    rhrElevated: boolean;
    sleepScore: number | null;
    hrvDeltaPct: number | null;
  };
}

const LOW_TIERS = ["depleted", "managing"];

const FORBIDDEN_WORDS_V6 = [...FORBIDDEN_NOTIFICATION_WORDS];

export const ALLOWED_CTA_VERBS_V8 = [
  "log in to prep your mind tonight",
  "log in to prep your mind",
  "log in to prep your state",
  "log in to recalibrate your mind",
  "check in to recalibrate",
  "check in to set your intention",
  "check in to set tomorrow",
  "check in to close the day",
  "check in to close the week",
  "check in to land the weekend",
  "open your insights",
  // v1.1 - Weekend / post-holiday CTA (routes to /plan).
  // Only fires when Brief snapshot + Plan ledger BOTH exist for today.
  "let's prioritise the week ahead",
  // v1.1 - Reminder variant (no-app-open CTA, back-to-back gap downgrade,
  // post-landing window). Body is self-sufficient; tap is optional.
  "take 60 seconds",
];

// V8 - body must reference at least one real, named context token.
// Sources: a calendar event title, a numeric physiological signal with
// unit, a countable today-state, a check-in outcome word, or a
// minutes-until / clock-time for a real event.
const NAMED_CONTEXT_RX_DEFAULT = [
  /\b(HRV|RHR|HR|sleep)\b\s*[-+]?\d/i, // HRV -22%, Sleep 62
  /\b\d+\s*\/\s*100\b/, // 62/100
  /\b\d+\s*(meeting|meetings|priority|priorities|min|minutes|day|days)\b/i,
  /\b(in|at)\s+\d{1,2}(?::\d{2})?\s*(min|minutes|am|pm|h)?\b/i, // in 25 min, at 10am
  /\b(started low|managing|depleted|heavy|low|peak|strong|focused|overloaded)\b/i,
];

export function requiresNamedContextToken(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): boolean {
  if (NAMED_CONTEXT_RX_DEFAULT.some((rx) => rx.test(body))) return true;
  const titles = ctx?.eventTitles ?? [];
  for (const t of titles) {
    if (!t || t.length < 3) continue;
    if (body.toLowerCase().includes(t.toLowerCase())) return true;
    // Title-cased words from a real event title (3+ chars) also count.
    const head = t.split(/\s+/).slice(0, 3).join(" ");
    if (head.length >= 3 && body.toLowerCase().includes(head.toLowerCase())) {
      return true;
    }
  }
  if (
    ctx?.checkinWord &&
    body.toLowerCase().includes(ctx.checkinWord.toLowerCase())
  ) return true;
  return false;
}

// V8 - first sentence must NOT be a bare metric statement. The metric, if
// used, must be embedded INSIDE a meaning sentence (parenthetical or clause).
export function violatesMeaningSentence(body: string): string | null {
  const first = body.split(/(?<=[.!?])\s+/)[0]?.trim() ?? body.trim();
  // Bare metric leads (HRV -22% today, RHR +9 bpm, Sleep 62/100, etc.)
  if (/^(HRV|RHR|HR|Sleep|Sleep score)\s*[-+]?\d[^.]*$/i.test(first)) {
    return `first sentence is a bare metric: "${first}"`;
  }
  // First sentence is purely a number+unit clause with no human meaning verb.
  if (/^[-+]?\d+\s*(%|bpm|\/100)\b[^.]*$/i.test(first)) {
    return `first sentence is a bare number+unit: "${first}"`;
  }
  return null;
}

export function violatesCopyContractV8(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): string | null {
  const lower = body.toLowerCase().trim();
  for (const w of FORBIDDEN_WORDS_V6) {
    const rx = new RegExp(
      `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (rx.test(lower)) return `forbidden word: "${w}"`;
  }
  // Must end with a V8 qualified mind-prep verb (allow trailing punctuation).
  const trailing = lower.replace(/[.!?\s]+$/, "");
  if (!ALLOWED_CTA_VERBS_V8.some((v) => trailing.endsWith(v))) {
    return "must end with a V8 qualified mind-prep CTA verb";
  }
  if (/\{[a-z_]+\}|\bN\b|--/i.test(body)) return "placeholder token detected";
  // Meaning-first lint
  const meaningViolation = violatesMeaningSentence(body);
  if (meaningViolation) return meaningViolation;
  // Named-context lint
  if (!requiresNamedContextToken(body, ctx)) {
    return "body cites no named context token (event title, metric+unit, count, time, or check-in word)";
  }
  const wordCount = body.trim().split(/\s+/).length;
  // v8 - meaning-forward bodies are longer than V7 metric-led bodies.
  // Gold-standard examples run 18–22 words.
  if (wordCount > 22) return `body too long (${wordCount} words, max 22)`;
  if (body.length > 140) return `body too long (${body.length} chars, max 140)`;
  return null;
}

export function isNamedContextViolation(violation: string): boolean {
  return violation.includes("no named context token");
}

export function buildV8CtxForCheck(
  ctx: CopyContractCheckCtx,
): { eventTitles: string[]; checkinWord: string | null } {
  return {
    eventTitles: [
      ...ctx.todayEvents.map((e) => e.title || ""),
      ...ctx.tomorrowEvents.map((e) => e.title || ""),
      ...ctx.highStakesEvents.map((e) => e.title || ""),
      ctx.firstNonNoiseEvent?.title || "",
    ].filter(Boolean),
    checkinWord: ctx.morningCheckinOutcome ?? null,
  };
}

/**
 * Launch truth gate — applied to BOTH AI output and static fallbacks.
 *
 * 1. The generic "see what it is costing you" suffix is retired outright.
 * 2. Cost / benefit framing must match the sign of the underlying metric
 *    (metric-polarity SSOT). "RHR down 23% ... costing you" is rejected.
 * 3. Felt-state claims ("started low") require a real morning check-in that
 *    actually reported a low tier.
 * 4. When an anchor event is supplied, future-tense wording is rejected for
 *    events that are already underway or finished.
 */
export function violatesTruthContract(
  body: string,
  ctx: TruthContractCheckCtx,
  anchorPhase?: EventPhase | null,
): string | null {
  if (containsGenericCostSuffix(body)) {
    return "retired generic cost suffix";
  }

  const lower = body.toLowerCase();

  // (3) State provenance.
  const claimsLowStart =
    /(started|began|woke up|morning (state|read)[^.]{0,20})\s*(was\s*)?low/
        .test(lower) ||
    lower.includes("started low") || lower.includes("you started the day low");
  if (claimsLowStart) {
    const outcome = ctx.morningCheckinOutcome;
    if (!outcome) return "asserts a low morning state with no check-in on file";
    if (!LOW_TIERS.includes(outcome)) {
      return `asserts a low morning state but check-in was "${outcome}"`;
    }
  }

  // (2) Metric polarity, checked against whichever metric the copy cites.
  const w = ctx.wearable;
  // RHR deviation vs the user's own 30-day baseline (signed, % of baseline).
  const rhrDeltaPct = w.rhr !== null && w.rhrBaseline30d
    ? ((w.rhr - w.rhrBaseline30d) / w.rhrBaseline30d) * 100
    : (w.rhrElevated ? 5 : null);
  // Sleep has no stored baseline here; use the score band as the signed proxy.
  const sleepDeltaPct = w.sleepScore === null
    ? null
    : w.sleepScore >= 70
    ? 5
    : w.sleepScore < 60
    ? -5
    : 0;
  const metricChecks: Array<[MetricKind, RegExp, number | null]> = [
    ["hrv", /hrv|heart rate variability/, w.hrvDeltaPct],
    ["rhr", /rhr|resting heart rate/, rhrDeltaPct],
    ["sleep", /sleep score|slept|sleep/, sleepDeltaPct],
  ];
  for (const [metric, rx, delta] of metricChecks) {
    if (!rx.test(lower)) continue;
    const polarityViolation = validateMetricPolarityInCopy(body, metric, delta);
    if (polarityViolation) return polarityViolation;
  }

  // (4) Event phase agreement.
  if (anchorPhase) {
    const phaseViolation = validateEventPhaseInCopy(body, anchorPhase);
    if (phaseViolation) return phaseViolation;
  }

  return null;
}
