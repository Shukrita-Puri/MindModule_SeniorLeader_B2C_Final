/**
 * CLUSTER: Influence & Persuasion (category B)
 * SOURCE: docs/CEO_BEHAVIOUR_RULE_MAP.md + §3 event taxonomy category B
 *         (negotiation, fundraise pitch, investor pitch, sales pitch).
 *
 * APPLICATION:
 * - BRIEF: name the persuasion frame; orient outcome clarity over confidence.
 * - PLAN:  `prepare` boost in the slot before the event (Mindset-Flow §4 B-pre).
 * - NUDGE: 15-min pre-event reframe focused on outcome + first move.
 *
 * SIGNALS CONSUMED: RuleContext.upcomingEvents[].categoryId === "B".
 * Detection lives in the canonical event classifier — this rule never matches
 * on title strings.
 *
 * OVERRIDES: yields to Travel and to boardLevelOutcome when the same event
 * resolves to category A (board/investor formal governance — that rule is the
 * higher-precedence frame).
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

export function influencePersuasionPrep(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.signals.travelLandingDetected || ctx.signals.travelDay) return null;

  // Highest-precedence category B event in the next 8h (covers same-morning
  // and afternoon pitches without bleeding into 24h advance-prep territory).
  const upcoming = ctx.upcomingEvents
    .filter((e) => e.categoryId === "B")
    .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= 8 * 60)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);
  const next = upcoming[0];
  if (!next) return null;

  // boardLevelOutcome owns same-day governance (≤4h); let it lead when it
  // co-fires on a high-stakes flagged event.
  if (next.minutesUntil <= 240 && ctx.signals.isHighVisibilityToday) return null;

  const severity: Severity = next.minutesUntil <= 90 ? "high" : "medium";
  const evidence = [`persuasion in ${Math.round(next.minutesUntil / 15) * 15}m`];
  return {
    rule: "influencePersuasionPrep",
    severity,
    evidence,
    anchorEvent: next.title,
    stake: "Executive Presence",
    copyHint:
      "persuasion frame · prime outcome clarity + first move; confidence is felt, not generated — keep the body settled to keep the message clean · open-plan",
  };
}