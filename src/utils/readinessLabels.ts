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
  min: number;
  max: number;
  text: string;
}> = [
  { min: 80, max: 100, text: "full strength — go after it" },
  { min: 65, max: 79, text: "ready and clear" },
  { min: 50, max: 64, text: "holding the line — solid, not your peak" },
  { min: 35, max: 49, text: "running on reserves — pick your battles" },
  { min: 0, max: 34, text: "running on empty — today's about protecting yourself" },
];

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

export type ReadinessState = "baseline" | "refined";

export function getReadinessStateLabel(state: ReadinessState): {
  label: string;
  subtitle: string;
} {
  return state === "refined"
    ? { label: "Full read", subtitle: "with your check-in" }
    : { label: "Early read", subtitle: "check in to sharpen it" };
}