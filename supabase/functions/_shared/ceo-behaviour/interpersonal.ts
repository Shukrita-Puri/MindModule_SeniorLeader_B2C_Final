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
 * the classifier's job and lives upstream in event-protocol-taxonomy.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

export function interpersonalMeetingContext(
  _ctx: RuleContext,
): BehaviourFlag | null {
  return null;
}
