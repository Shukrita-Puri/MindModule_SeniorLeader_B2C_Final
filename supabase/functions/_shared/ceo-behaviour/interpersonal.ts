/**
 * CLUSTER: Interpersonal meeting context (STUB — Batch 3)
 * SOURCE: user spec — recognise interpersonal weight separately from decision
 * density. A 1:1 with a direct report, a performance review, or a difficult
 * conversation carries a distinct cost profile (presence + emotional regulation)
 * that decisionDensity does NOT capture.
 *
 * APPLICATION (when detector lands):
 * - BRIEF: surface as "people-heavy day" cluster pill, separate from decisions.
 * - PLAN:  boost `align` (presence) before block; `integrate` after.
 * - NUDGE: 60-min pre-event reframe focused on listening + restraint.
 *
 * RULES: interpersonalMeetingContext
 *
 * SIGNALS REQUIRED:
 *   upcomingEvents[].attendeeCount  (≤4 + interpersonal title = 1:1 weight)
 *   upcomingEvents[].isInterpersonal (classifier on title: 1:1, review, escalation,
 *                                     difficult conversation, layoff, HR, conflict)
 *
 * UNTIL DETECTOR LANDS: returns null. Do NOT inline-detect on title — that's
 * the classifier's job and lives upstream in events/event-categories.ts.
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

/**
 * Fires when an upcoming event in the next 4h is flagged interpersonal
 * (category D, or `isInterpersonal=true`). `isInterpersonal` and `categoryId`
 * are set upstream by the canonical event classifier — never inline-detect on
 * title here.
 */
export function interpersonalMeetingContext(
  ctx: RuleContext,
): BehaviourFlag | null {
  if (ctx.signals.travelLandingDetected || ctx.signals.travelDay) return null;

  const next = ctx.upcomingEvents
    .filter((e) => e.isInterpersonal === true || e.categoryId === "D")
    .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= 4 * 60)
    .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
  if (!next) return null;

  const intimate = (next.attendeeCount ?? 99) <= 4;
  const severity: Severity =
    next.minutesUntil <= 60 && intimate ? "high" :
    next.minutesUntil <= 120 ? "medium" : "low";

  return {
    rule: "interpersonalMeetingContext",
    severity,
    evidence: intimate
      ? [`interpersonal block in ${Math.round(next.minutesUntil / 15) * 15}m`, "intimate (≤4 attendees)"]
      : [`interpersonal block in ${Math.round(next.minutesUntil / 15) * 15}m`],
    anchorEvent: next.title,
    stake: "Executive Presence",
    copyHint:
      "people-heavy block · listen first, restrain reactive replies; parasympathetic re-entry before, Mindset-Pause after to offload relational charge · open-plan",
  };
}
