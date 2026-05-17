/**
 * CLUSTER: Conference / multi-day external event
 * SOURCE: doc §5.2 row "Conference depletion"
 *
 * APPLICATION:
 * - BRIEF: name cumulative cost of multi-day on-stage time; orient to recovery.
 * - PLAN:  boost `regulate` slot 1 + `integrate` slot 3 from day 2 onward.
 * - NUDGE: severity-high nudges only on day 3+; suppress generic cadence.
 *
 * SIGNALS CONSUMED: RuleContext.conferenceDayNumber.
 * OVERRIDES: yields to Travel cluster.
 * NOT IN MVP: detector. Returns null until `conferenceDayNumber` is populated upstream.
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

export function conferenceDepletion(ctx: RuleContext): BehaviourFlag | null {
  const day = ctx.conferenceDayNumber;
  if (typeof day !== "number" || day < 2) return null;
  const severity: Severity = day >= 3 ? "high" : "medium";
  return {
    rule: "conferenceDepletion",
    severity,
    evidence: [`conference day ${day}`],
    stake: "Physical Recovery",
    copyHint:
      "name the cumulative cost of multi-day on-stage time; orient to recovery protection, not output expansion",
  };
}