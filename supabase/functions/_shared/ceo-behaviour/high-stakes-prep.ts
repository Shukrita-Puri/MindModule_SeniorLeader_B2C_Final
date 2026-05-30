/**
 * CLUSTER: High-stakes prep (24h window — MVP cap per user direction)
 * SOURCE: doc §5.2 row "Advance prep" + boardLevelOutcome (carried in workweek.ts).
 *
 * APPLICATION (Batch 2):
 * - BRIEF: anchor to the named event; reference protect-state language.
 * - PLAN:  `prepare` boost in slot before event start; severity-driven magnitude.
 * - NUDGE: morning-of nudge anchored to the event.
 *
 * RULES (Batch 2):
 *   advancePrep24h  // any high-stakes event within next 24h that is not also "today" → prime tomorrow
 *
 * NOT IN MVP: 48h prep window. Stakes-hierarchy refactor remains out (edge function carries it).
 *
 * SIGNALS CONSUMED: highStakesEventInNext24h, isHighVisibilityToday.
 * OVERRIDES: yields to Travel; co-exists with boardLevelOutcome.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

/**
 * 24h advance prep window (MVP cap — no 48h yet).
 * Fires when a high-stakes event sits in the next 24h AND is NOT already within today's
 * boardLevelOutcome same-day frame (>4h out → tomorrow-prime; <=4h is boardLevelOutcome's job).
 */
export function advancePrep24h(ctx: RuleContext): BehaviourFlag | null {
  const next = ctx.signals.highStakesEventInNext24h;
  if (!next) return null;
  if (next.minutesUntil <= 240) return null; // boardLevelOutcome owns same-day <=4h
  if (next.minutesUntil > 24 * 60) return null;

  // Travel landing+high-stakes already carries this contract.
  if (ctx.signals.travelLandingDetected) return null;

  const hoursOut = Math.round(next.minutesUntil / 60);
  return {
    rule: "advancePrep24h",
    severity: next.minutesUntil <= 12 * 60 ? "medium" : "low",
    evidence: [`high-stakes in ${hoursOut}h`],
    anchorEvent: next.title,
    stake: "Executive Presence",
    copyHint:
      "prime tomorrow now — one prep micro-block today, protect sleep tonight; do not let the event hijack this evening",
  };
}

/**
 * postGovernanceOffload — after a high-stakes governance block (A: board,
 * investor, earnings, M&A) ends, the system should prescribe a recovery
 * window. Today we proxy on `signals.postPeakWindow` AND no upcoming high-
 * stakes event in the look-ahead, which together describe the morning-after
 * a governance peak. When the dedicated `recentlyEndedHighStakesMinutesAgo`
 * field lands upstream, swap the gate for that exact signal.
 *
 * Co-exists with `postPeakHangover`: that rule additionally requires a
 * recovery deficit; this one prescribes the offload regardless of felt state.
 */
export function postGovernanceOffload(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (s.isHighVisibilityToday) return null;
  if (s.travelLandingDetected || s.travelDay) return null;
  if (!s.postPeakWindow) return null;
  return {
    rule: "postGovernanceOffload",
    severity: "medium",
    evidence: ["high-output yesterday", "look-ahead clear today"],
    stake: "Physical Recovery",
    copyHint:
      "post-governance offload · Somatic-Reenergise this morning + Mindset-Pause to capture the lesson; do not stack a second peak today · open-plan",
  };
}