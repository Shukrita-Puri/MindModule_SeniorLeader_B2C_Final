/**
 * CLUSTER: Stubs (return null; lock API surface)
 * SOURCE: doc §5.2 backlog + senior-engineer probes confirmed by user.
 *
 * Each stub returns null until the relevant detector lands in brief-signal-coverage.ts
 * or upstream UI/native bridge. The flag shape and downstream consumers stay identical
 * when the detector ships — only this file changes.
 *
 * STUBS (Batch 3):
 *   interpersonalMeetingContext  // needs upcomingEvents[].attendeeCount + isInterpersonal
 *   emptySlotProtection          // needs hasUpcomingEmptyBlock detector (gap >= 90min)
 *   upwardReporting              // needs userMarkedPriorities (UI dependency)
 *   stackedStakes                // same-day board + emotional; needs joint stakes detector
 *   crisisInjection              // ctx.crisisEvent set by user UI "unplanned high-stakes in N min"
 *   contextSwitchingCost         // back-to-back across different topic domains; needs classifier
 *   preEventSleepTarget          // tonight's evening nudge references tomorrow's high-stakes
 *   timeSinceLastRecovery        // ctx.minutesSinceLastPractice > 36h + active stakes today
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

/**
 * STUB CONTRACT
 * Each function below returns `null` today. They reserve the BehaviourFlag API
 * surface so Phase 2 wiring is reviewed ONCE. When the underlying signal lands
 * (in brief-signal-coverage.ts or upstream UI/native bridge), only the body of
 * the function changes — the rule name, scope tags, and downstream consumers
 * stay identical. Do not delete a stub without confirming no surface ships it
 * in copy or telemetry.
 */

/**
 * stackedStakes — same-day high-stakes (board/external/investor) AND emotionally
 * loaded event (layoff, performance review, escalation). Reframe protects the
 * second event from leakage out of the first.
 * Detector needed: joint stakes detector reading signals.highStakesEventInNext24h
 * AND signals.emotionalDrainEventInNext4h on the same calendar day.
 */
export function stackedStakes(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  const stakes = s.highStakesEventInNext24h;
  const drain = s.emotionalDrainEventInNext4h;
  if (!stakes || !drain) return null;
  if (stakes.minutesUntil > 24 * 60) return null;
  if (s.travelLandingDetected || s.travelDay) return null;
  return {
    rule: "stackedStakes",
    severity: "high",
    evidence: [
      `stakes "${stakes.title}" in ${Math.round(stakes.minutesUntil / 30) * 30}m`,
      `drain "${drain.title}" in ${Math.round(drain.minutesUntil / 15) * 15}m`,
    ],
    anchorEvent: stakes.title,
    stake: "Strategic Composure",
    copyHint:
      "stacked stakes day · protect the second block from the first's residue; Mindset-Pause between, do not let either bleed forward · open-plan",
  };
}

/**
 * crisisInjection — user-flagged unplanned high-stakes event (UI affordance
 * "an unplanned thing just landed"). When set, overrides the next slot's
 * regulate target with prepare+name-the-stake.
 * Detector needed: ctx.crisisEvent populated from user-side affordance.
 */
export function crisisInjection(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}

/**
 * contextSwitchingCost — back-to-back across different topic domains
 * (e.g. product → finance → hiring) inside the same 4h window. Penalises the
 * cognitive transition tax beyond what decisionDensity already counts.
 * Detector needed: topic classifier on event titles; pairwise domain diff in
 * the 4h window.
 */
export function contextSwitchingCost(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.signals.travelLandingDetected || ctx.signals.travelDay) return null;

  const inWindow = ctx.upcomingEvents
    .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= 4 * 60)
    .filter((e) => !!e.categoryId && e.categoryId !== "H");

  const distinct = new Set(inWindow.map((e) => e.categoryId!));
  if (distinct.size < 3) return null;

  const hasEmotional = distinct.has("D");
  const hasHighCognitive = distinct.has("A") || distinct.has("B") || distinct.has("C");
  const severity: BehaviourFlag["severity"] =
    (hasEmotional && hasHighCognitive) ? "high" : "medium";

  const nameMap: Record<string, string> = {
    A: "governance", B: "pitch/influence", C: "visibility",
    D: "people/difficult", E: "deep work", F: "conference", G: "travel",
  };
  const categoryNames = Array.from(distinct).map((c) => nameMap[c] ?? c);
  const sequenceStr = categoryNames.join(" → ");

  return {
    rule: "contextSwitchingCost",
    severity,
    evidence: [
      `${distinct.size} distinct event categories in next 4h`,
      `sequence: ${sequenceStr}`,
    ],
    stake: "Mental Bandwidth",
    copyHint:
      `context-switch tax: ${sequenceStr} sequence in the next 4h. Beat (a): name the signal + the sequence of distinct modes. Beat (b): each mode-switch costs more than the meeting does — the transitions are the real load. Beat (c): protect the gaps between distinct demands; that is where composure holds or leaks. Beat (d): 3–5 word close. Never name any single meeting as the problem — the sequence is the problem.`,
  };
}

/**
 * preEventSleepTarget — tonight's evening nudge references TOMORROW's
 * high-stakes event with a sleep-target framing (e.g. "guard 7.5h — board
 * starts at 09:00").
 * Detector needed: surface tomorrow's high-stakes anchor + protected sleep
 * window; today already has highStakesEventInNext24h but no day-boundary
 * partition.
 */
export function preEventSleepTarget(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}

/**
 * timeSinceLastRecovery — minutes since the last completed practice exceeds 36h
 * AND there are active stakes today. Prevents the "the app has gone quiet"
 * failure mode without becoming a habit-tracker nag.
 * Detector needed: ctx.minutesSinceLastPractice populated by consumer + active
 * stakes today (signals.isHighVisibilityToday OR backToBackHoursToday ≥ 3).
 */
export function timeSinceLastRecovery(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}
