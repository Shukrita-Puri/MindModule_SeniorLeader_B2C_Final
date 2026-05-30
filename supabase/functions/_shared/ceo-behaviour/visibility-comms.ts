/**
 * CLUSTER: Visibility & Communication (category C)
 * SOURCE: docs/CEO_BEHAVIOUR_RULE_MAP.md + §3 event taxonomy category C
 *         (keynote, all-hands, media, press, town hall).
 *
 * APPLICATION:
 * - BRIEF: distinguish from B (persuasion) — audience is many, stake is presence.
 * - PLAN:  Somatic-Pause `prepare` boost T-30 (§4 C-pre); Somatic-Reenergise post.
 * - NUDGE: 30-min pre-event presence prime.
 *
 * SIGNALS CONSUMED: RuleContext.upcomingEvents[].categoryId === "C".
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

export function visibilityCommsPrep(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.signals.travelLandingDetected || ctx.signals.travelDay) return null;

  const upcoming = ctx.upcomingEvents
    .filter((e) => e.categoryId === "C")
    .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= 24 * 60)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);
  const next = upcoming[0];
  if (!next) return null;

  // Conference cluster owns conferenceDayWithSpeaking / dropInSpeakingHighStakes
  // when the visibility event sits inside a multi-day summit chain.
  if (typeof ctx.signals.conferenceDayNumber === "number") return null;

  const severity: Severity =
    next.minutesUntil <= 60 ? "high" : next.minutesUntil <= 240 ? "medium" : "low";
  return {
    rule: "visibilityCommsPrep",
    severity,
    evidence: [`visibility event in ${Math.round(next.minutesUntil / 15) * 15}m`],
    anchorEvent: next.title,
    stake: "Executive Presence",
    copyHint:
      "stage / audience event · prime presence not performance — Somatic-Pause T-30 to distinguish arousal from anxiety; recover after to clear stage chemistry · open-plan",
  };
}