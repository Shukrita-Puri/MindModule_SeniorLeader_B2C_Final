// Sprint 7 / Phase 9A — Brief deterministic fallback decision helper.
//
// Pure, testable predicate that decides whether the deterministic Brief
// composer (getTheme) output may substitute for a failed/invalid LLM
// Brief on a given run. The v6.5 "no deterministic prose" contract still
// holds when the underlying signal state is awaiting; this helper only
// re-opens the deterministic path when the Brief should legitimately be
// ready but the LLM call failed.
//
// The caller owns actually plumbing `finalPhrase` / `finalContext` into
// the response + `brief_source='deterministic'` into persistence.

export interface DeterministicFallbackInput {
  /** True if a same-signature cached snapshot is already being returned. */
  cachedSnapshotPresent: boolean;
  /** True if the LLM produced an accepted brief on this run. */
  llmBriefPresent: boolean;
  /** True when the signal contract is in cold-start / no-context state. */
  awaitingSignals: boolean;
  /** True when the MRS/inner readiness state is awaiting. */
  innerStateIsAwaiting: boolean;
  /** Deterministic composer's phrase output (from getTheme). */
  deterministicPhrase: string | null | undefined;
  /** Deterministic composer's body output (from getTheme + patternOverride). */
  deterministicBody: string | null | undefined;
}

export type FallbackDecision =
  | { use: true; reason: "llm_miss_signals_ready" }
  | { use: false; reason: FallbackSkipReason };

export type FallbackSkipReason =
  | "cache_hit"
  | "llm_accepted"
  | "awaiting_signals"
  | "inner_state_awaiting"
  | "deterministic_copy_missing"
  | "deterministic_copy_invalid";

/**
 * Soft body-word ceiling for the deterministic Brief. Matches the LLM
 * Brief's 55–60 range so persisted rows stay uniform in shape.
 */
export const DETERMINISTIC_BODY_MAX_WORDS = 60;

/**
 * Decide whether the deterministic Brief may be persisted/returned this
 * run. Rules — in strict precedence order:
 *   1. cache hit → use cache, not deterministic
 *   2. LLM accepted → use LLM
 *   3. awaiting signals / inner-state awaiting → stay awaiting
 *   4. deterministic phrase/body missing or invalid → stay awaiting
 *   5. otherwise deterministic
 */
export function decideBriefFallback(inp: DeterministicFallbackInput): FallbackDecision {
  if (inp.cachedSnapshotPresent) return { use: false, reason: "cache_hit" };
  if (inp.llmBriefPresent) return { use: false, reason: "llm_accepted" };
  if (inp.awaitingSignals) return { use: false, reason: "awaiting_signals" };
  if (inp.innerStateIsAwaiting) return { use: false, reason: "inner_state_awaiting" };
  const phrase = (inp.deterministicPhrase ?? "").trim();
  const body = (inp.deterministicBody ?? "").trim();
  if (!phrase || !body) return { use: false, reason: "deterministic_copy_missing" };
  if (!isDeterministicBodyValid(body)) return { use: false, reason: "deterministic_copy_invalid" };
  return { use: true, reason: "llm_miss_signals_ready" };
}

/**
 * Cap the deterministic body to the shared word ceiling. Deterministic
 * templates in `getTheme` are already tuned to ~45–55 words; this guard
 * defends against future template drift silently persisting long copy.
 */
export function capDeterministicBody(body: string, maxWords = DETERMINISTIC_BODY_MAX_WORDS): string {
  const clean = (body || "").trim();
  if (!clean) return clean;
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  const head = words.slice(0, maxWords).join(" ").replace(/[,;:.\-—\s]+$/, "");
  return head + ".";
}

// Wellness / clinical / corporate filler tokens that must never appear in
// deterministic Brief copy. Kept intentionally narrow — the deterministic
// templates are hand-written and audited; this is a defensive guard rail,
// not a full lexicon check.
const DETERMINISTIC_BANNED = /\b(mindful|recharge|self-care|wellness|journey|synerg|leverage the|holistic|nurture|nourish|breathe|cortisol|parasympathetic|sympathetic)\b/i;

function isDeterministicBodyValid(body: string): boolean {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 3) return false;
  if (words > DETERMINISTIC_BODY_MAX_WORDS + 10) return false; // hard reject well beyond soft cap
  if (DETERMINISTIC_BANNED.test(body)) return false;
  return true;
}