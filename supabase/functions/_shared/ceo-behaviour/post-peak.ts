/**
 * CLUSTER: Post-peak (recovery after a high-output day)
 * SOURCE: doc §2.15
 *
 * APPLICATION:
 * - BRIEF: reference yesterday's peak briefly, orient toward recovery first.
 * - PLAN:  boost `regulate` / `integrate` in slot 1 when severity ≥ medium.
 * - NUDGE: not surfaced — brief and plan carry it.
 *
 * SIGNALS CONSUMED: yesterdayScore, hrvDeviationPct, sleepBelow6h, rhrDeviationPct,
 *                   clarityDropFromTrailingAvg.
 * OVERRIDES: yields to Travel cluster.
 * NOT IN MVP: post-peak-hangover does NOT propagate to nudges; would compete with cliff/board.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

export function postPeakHangover(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (typeof signals.yesterdayScore !== "number" || signals.yesterdayScore < 75) {
    return null;
  }

  const recoveryDeficit =
    (typeof signals.hrvDeviationPct === "number" && signals.hrvDeviationPct <= -10) ||
    signals.sleepBelow6h ||
    (typeof signals.rhrDeviationPct === "number" && signals.rhrDeviationPct >= 8);

  const clarityDrop =
    typeof signals.clarityDropFromTrailingAvg === "number" &&
    signals.clarityDropFromTrailingAvg <= -2;

  if (!recoveryDeficit && !clarityDrop) return null;

  const evidence: string[] = [`yesterday ${signals.yesterdayScore}/100`];
  if (recoveryDeficit) evidence.push("recovery deficit");
  if (clarityDrop) evidence.push(`clarity ${signals.clarityDropFromTrailingAvg}`);

  return {
    rule: "postPeakHangover",
    severity: recoveryDeficit && clarityDrop ? "high" : "medium",
    evidence,
    stake: "Physical Recovery",
    copyHint:
      "reference yesterday's peak briefly, orient toward Hardware Recovery before the next high-stakes block — name the cost before directing",
  };
}