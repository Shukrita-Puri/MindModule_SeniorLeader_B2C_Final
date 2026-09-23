/**
 * pattern-eligibility.ts — the ONE shared check for citing a pattern in a
 * nudge, the Mastery Plan or the Brief. Nudges, Plan and Brief all call this,
 * so they can never disagree.
 *
 * A pattern may be quoted only when ALL of these hold:
 *   1. ENOUGH EVIDENCE — 3+ occurrences of that event type (never rounded).
 *   2. UP TO DATE      — it includes the leader's most recent occurrence of
 *                        that event type. Judged on occurrences, not on a
 *                        calendar window: a quarterly board is judged on the
 *                        last boards however long ago.
 *   3. NEGATIVE        — it shows harm (higher RHR, lower HRV, worse sleep,
 *                        slower recovery). Nudges are negative-only; the Brief
 *                        and the Plan may also cite a positive pattern, which
 *                        goes through `allowPositive`.
 *   4. RIGHT TIME      — that event type happens today, or starts tomorrow.
 *   5. RIGHT CONTEXT   — quoted only alongside its own event type. No category
 *                        fallback: if a subtype has fewer than 3 occurrences,
 *                        nothing is said.
 *   6. REAL NUMBERS    — the copy states the true occurrence count.
 *
 * Insights does not use this module. Pure: no IO, never throws.
 */

import type {
  PatternMeasure,
  SubtypePattern365,
  SubtypePatterns365,
} from "./subtype-patterns-365.ts";
import { MIN_OCCURRENCES } from "./subtype-patterns-365.ts";

export type RejectReason =
  | "no_pattern_store"
  | "insufficient_occurrences"
  | "not_up_to_date"
  | "not_negative"
  | "wrong_time"
  | "no_matching_event"
  | "missing_data"
  | "not_surfaceable";

export interface PatternContext {
  /**
   * Keys of event types happening TODAY. Key form:
   *   subtype  → `${categoryId}:${subcategory}`
   *   category → `${categoryId}`
   */
  todayKeys: Set<string>;
  /** Keys of event types starting TOMORROW (evening-before / day-before use). */
  tomorrowKeys: Set<string>;
  /**
   * Most recent occurrence date per key, from the same source as the pattern.
   * When a key is absent the check treats the pattern as up to date only if it
   * has no conflicting evidence.
   */
  latestOccurrenceByKey?: Map<string, string>;
  /** Brief / Plan may cite positive patterns; nudges may not. */
  allowPositive?: boolean;
}

export interface EligibilityResult {
  ok: boolean;
  reason: RejectReason | "eligible";
  /** "today" or "tomorrow" — drives the tense of the copy. */
  timing?: "today" | "tomorrow";
}

export function patternKey(p: SubtypePattern365): string {
  return p.matchLevel === "category"
    ? p.categoryId
    : `${p.categoryId}:${p.subcategory ?? "-"}`;
}

/** Decide one pattern against today's / tomorrow's real events. */
export function isPatternCitable(
  pattern: SubtypePattern365 | null | undefined,
  context: PatternContext,
): EligibilityResult {
  if (!pattern) return { ok: false, reason: "missing_data" };
  if (pattern.surfaced === false) return { ok: false, reason: "not_surfaceable" };

  // 1. Enough evidence — the real count, no rounding, no category fallback.
  if (!Number.isFinite(pattern.n) || pattern.n < MIN_OCCURRENCES) {
    return { ok: false, reason: "insufficient_occurrences" };
  }

  // 3. Negative (unless the caller explicitly allows positive framing).
  if (pattern.direction !== "harm") {
    if (!context.allowPositive || pattern.direction !== "recovery") {
      return { ok: false, reason: "not_negative" };
    }
  }
  if (pattern.confidence == null) {
    return { ok: false, reason: "not_negative" };
  }
  if (pattern.measure !== "recovery" && pattern.deltaPct == null) {
    return { ok: false, reason: "missing_data" };
  }
  if (pattern.measure === "recovery" && pattern.recoveryDays == null) {
    return { ok: false, reason: "missing_data" };
  }

  const key = patternKey(pattern);

  // 2. Up to date — must include the latest occurrence of this event type.
  const latest = context.latestOccurrenceByKey?.get(key);
  if (latest && pattern.lastSeen && pattern.lastSeen < latest) {
    return { ok: false, reason: "not_up_to_date" };
  }

  // 4 + 5. Right time AND right context — its own event type, today or tomorrow.
  if (context.todayKeys?.has(key)) return { ok: true, reason: "eligible", timing: "today" };
  if (context.tomorrowKeys?.has(key)) {
    return { ok: true, reason: "eligible", timing: "tomorrow" };
  }
  return {
    ok: false,
    reason: (context.todayKeys?.size ?? 0) + (context.tomorrowKeys?.size ?? 0) === 0
      ? "no_matching_event"
      : "wrong_time",
  };
}

export interface CitablePattern {
  pattern: SubtypePattern365;
  timing: "today" | "tomorrow";
}

/**
 * Pick the strongest citable pattern: confidence, then most recent, then the
 * biggest effect. Negative always wins over positive.
 */
export function pickCitablePattern(
  store: SubtypePatterns365 | null | undefined,
  context: PatternContext,
): { chosen: CitablePattern | null; rejections: Array<{ key: string; measure: PatternMeasure; reason: RejectReason }> } {
  const rejections: Array<{ key: string; measure: PatternMeasure; reason: RejectReason }> = [];
  const items = store?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { chosen: null, rejections: [{ key: "-", measure: "rhr", reason: "no_pattern_store" }] };
  }

  const eligible: CitablePattern[] = [];
  for (const p of items) {
    const verdict = isPatternCitable(p, context);
    if (verdict.ok && verdict.timing) {
      eligible.push({ pattern: p, timing: verdict.timing });
    } else {
      rejections.push({
        key: patternKey(p),
        measure: p.measure,
        reason: verdict.reason as RejectReason,
      });
    }
  }
  if (eligible.length === 0) return { chosen: null, rejections };

  eligible.sort((a, b) => {
    const harm = (x: CitablePattern) => (x.pattern.direction === "harm" ? 0 : 1);
    if (harm(a) !== harm(b)) return harm(a) - harm(b);
    const conf = (x: CitablePattern) => (x.pattern.confidence === "strong" ? 0 : 1);
    if (conf(a) !== conf(b)) return conf(a) - conf(b);
    const seen = (b.pattern.lastSeen ?? "").localeCompare(a.pattern.lastSeen ?? "");
    if (seen !== 0) return seen;
    return Math.abs(b.pattern.deltaPct ?? 0) - Math.abs(a.pattern.deltaPct ?? 0);
  });

  return { chosen: eligible[0], rejections };
}

const MEASURE_PHRASE: Record<PatternMeasure, string> = {
  rhr: "resting heart rate",
  hrv: "recovery signal",
  sleep: "sleep quality",
  recovery: "recovery",
};

function pluralLabel(pattern: SubtypePattern365): string {
  const base = (pattern.label ?? pattern.categoryId).toLowerCase();
  if (pattern.unit === "trip") return pattern.n === 1 ? "trip" : "trips";
  if (base.endsWith("s")) return base;
  return `${base}s`;
}

/**
 * Past-tense evidence plus what's ahead, with the REAL occurrence count and
 * real stored numbers only. Never present tense about today.
 */
export function composePatternSentence(
  cite: CitablePattern | null | undefined,
): string | null {
  if (!cite) return null;
  const p = cite.pattern;
  const when = cite.timing === "today" ? "today" : "tomorrow";
  const lead = p.unit === "trip"
    ? (cite.timing === "today" ? "Travel today." : "Travel tomorrow.")
    : `${p.label ?? p.categoryId} ${when}.`;

  if (p.measure === "recovery") {
    if (p.recoveryDays == null) return null;
    const d = p.recoveryDays;
    return `${lead} Your last ${p.n} ${pluralLabel(p)} took ${
      d === 1 ? "a day" : `${d} days`
    } to settle.`;
  }

  if (p.deltaPct == null) return null;
  const magnitude = Math.abs(Math.round(p.deltaPct));
  const verb = p.measure === "rhr"
    ? (p.deltaPct > 0 ? "raised" : "lowered")
    : (p.deltaPct < 0 ? "lowered" : "lifted");
  return `${lead} Your last ${p.n} ${pluralLabel(p)} ${verb} your ${
    MEASURE_PHRASE[p.measure]
  } by ${magnitude}%.`;
}

/** Read the store off a raw `signal_summary`, tolerating any shape. */
export function readPatternStore(
  signalSummary: unknown,
): SubtypePatterns365 | null {
  const store = (signalSummary as Record<string, unknown> | null | undefined)
    ?.subtype_patterns_365;
  if (!store || typeof store !== "object") return null;
  const items = (store as SubtypePatterns365).items;
  if (!Array.isArray(items)) return null;
  return store as SubtypePatterns365;
}

/** Build today/tomorrow keys from resolved events. Missing data → empty sets. */
export function buildPatternContext(
  todayEvents: Array<{ categoryId?: string | null; subcategory?: string | null }>,
  tomorrowEvents: Array<{ categoryId?: string | null; subcategory?: string | null }>,
  opts?: { allowPositive?: boolean; latestOccurrenceByKey?: Map<string, string> },
): PatternContext {
  const keysOf = (
    list: Array<{ categoryId?: string | null; subcategory?: string | null }>,
  ) => {
    const s = new Set<string>();
    for (const e of list ?? []) {
      if (!e?.categoryId) continue;
      s.add(e.categoryId);
      if (e.subcategory) s.add(`${e.categoryId}:${e.subcategory}`);
    }
    return s;
  };
  return {
    todayKeys: keysOf(todayEvents),
    tomorrowKeys: keysOf(tomorrowEvents),
    allowPositive: opts?.allowPositive === true,
    latestOccurrenceByKey: opts?.latestOccurrenceByKey,
  };
}
