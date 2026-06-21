/**
 * User-facing readiness copy.
 *
 * Spec: replace tier-word display ("Strong", "Peak", etc.) on Brief / Home /
 * MRS surfaces with a one-line read keyed off the raw score. Internal tier
 * names remain lowercase strings for logic/logging/prompt seeding.
 *
 * Also replaces the visible "(Refined)" / "(Baseline)" badge wording with
 * "Full read" / "Early read" plus a subtitle.
 */

export const READINESS_ONE_LINERS: ReadonlyArray<{
  id: ReadinessBandId;
  valence: ReadinessValence;
  min: number;
  max: number;
  text: string;
}> = [
  { id: "full",     valence: "high", min: 80, max: 100, text: "full strength — go after it" },
  { id: "ready",    valence: "high", min: 65, max: 79,  text: "ready and clear" },
  { id: "holding",  valence: "mid",  min: 50, max: 64,  text: "holding the line — solid, not your peak" },
  { id: "reserves", valence: "low",  min: 35, max: 49,  text: "running on reserves — pick your battles" },
  { id: "empty",    valence: "low",  min: 0,  max: 34,  text: "running on empty — today's about protecting yourself" },
];

/** Canonical band ids — MUST stay in sync with compute-inner-readiness. */
export type ReadinessBandId = "full" | "ready" | "holding" | "reserves" | "empty";
/** Three-bucket valence used by Brief/Plan to gate copy and practice bias. */
export type ReadinessValence = "low" | "mid" | "high";

/** The five verbatim strings; used by the brief validator to reject restatement. */
export const READINESS_ONE_LINER_STRINGS: readonly string[] =
  READINESS_ONE_LINERS.map((r) => r.text);

export function getReadinessOneLiner(score: number | null | undefined): string | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of READINESS_ONE_LINERS) {
    if (s >= band.min && s <= band.max) return band.text;
  }
  return null;
}

export function getReadinessBand(score: number | null | undefined): ReadinessBandId | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of READINESS_ONE_LINERS) {
    if (s >= b.min && s <= b.max) return b.id;
  }
  return null;
}

export function getReadinessValence(score: number | null | undefined): ReadinessValence | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of READINESS_ONE_LINERS) {
    if (s >= b.min && s <= b.max) return b.valence;
  }
  return null;
}

export type ReadinessState = "baseline" | "refined" | "awaiting";

/**
 * MRS V4 (2026-06-21) — strict label mapping.
 *
 *   refined                              → "Full read"  (fresh wearable + check-in)
 *   baseline + fresh wearable            → "Early read" (wearable only)
 *   baseline + missing / stale wearable  → "Awaiting signals"
 *   awaiting                             → "Awaiting signals"
 *
 * The label MUST NOT say "Early read" for awaiting, stale-wearable, or
 * check-in-only states. Pass `wearableFresh` so this helper can apply the
 * correct downgrade without each consumer re-implementing the rule.
 */
export function getReadinessStateLabel(
  state: ReadinessState,
  wearableFresh: boolean = false,
): { label: string; subtitle: string } {
  // MRS V4 (P0 2026-06-21) — defence in depth: even if an upstream
  // consumer forwards `refined` without fresh wearable, the visible label
  // must NEVER claim "Full read". This mirrors the server-side gate in
  // compute-outer-readiness so the UI cannot disagree with the contract.
  if (state === "refined" && wearableFresh) {
    return { label: "Full read", subtitle: "with your check-in" };
  }
  if (state === "refined" && !wearableFresh) {
    return {
      label: "Awaiting signals",
      subtitle: "sync your wearable and check in",
    };
  }
  if (state === "baseline" && wearableFresh) {
    return { label: "Early read", subtitle: "check in to sharpen it" };
  }
  // awaiting, or baseline without fresh wearable (no/stale wearable paths).
  return {
    label: "Awaiting signals",
    subtitle: "sync your wearable and check in",
  };
}
