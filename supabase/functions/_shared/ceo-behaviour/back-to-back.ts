/**
 * CLUSTER: Back-to-back load + meeting-prep cliff
 * SOURCE: doc §5.2 rows "Back-to-back load override" + user's "2nd nudge" cliff rule.
 *
 * APPLICATION (Batch 2):
 * - BRIEF: not surfaced (intra-day, nudge-only signal).
 * - PLAN:  no boost (slots already compressed).
 * - NUDGE: meetingPrepCliff forces notification-is-product copy contract — full
 *          reframe in body, no app-open CTA, TTL = gap minutes − 1.
 *
 * RULES (Batch 2):
 *   backToBackLoadOverride  // ≥4h back-to-back + ≥1 gap <15min → light-touch mode
 *   meetingPrepCliff        // gap ∈ {5,15,30}min before high-stakes → notification-is-product
 *
 * CLIFF SEVERITY:
 *   gap == 5min  → high   (no time even to read more than the title)
 *   gap == 15min → medium (one-line reframe + 90s cue)
 *   gap == 30min → low    (can include a "tap for 2-min reset" CTA)
 *
 * SIGNALS CONSUMED: backToBackHoursToday, backToBackHoursAggregated,
 *                   ctx.nextPreEventGap, ctx.upcomingEvents.
 * OVERRIDES: yields to Travel landing window.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";
import { isHighStakesTitle } from "../executive-state-taxonomy.ts";

function travelLandingProtected(ctx: RuleContext): boolean {
  if (!ctx.signals.travelLandingDetected) return false;
  const since = ctx.lastTravelEventEndedMinutesAgo ?? 0;
  const window =
    ctx.signals.longHaulFlight && ctx.signals.longHaulFlight.durationHours >= 3
      ? 90
      : 60;
  return since <= window;
}

/** ≥4h back-to-back today → light-touch mode; downstream surfaces should suppress full check-in asks. */
export function backToBackLoadOverride(ctx: RuleContext): BehaviourFlag | null {
  if (travelLandingProtected(ctx)) return null;

  const local = ctx.backToBackHoursToday ?? 0;
  const agg = ctx.signals.backToBackHoursAggregated ?? 0;
  const hours = Math.max(local, agg);
  if (hours < 4) return null;

  return {
    rule: "backToBackLoadOverride",
    severity: hours >= 6 ? "high" : "medium",
    evidence: [`back-to-back ${hours}h`],
    stake: "Mental Bandwidth",
    copyHint:
      "the day is compressed — single in-body cue, no app open; notification IS the value, gap arithmetic decides the timing",
  };
}

/**
 * Mid-day "second nudge" guard rail per user spec.
 *
 * Suppress entirely when:
 *   - gap < 30min (5/15min cases are too tight even to read), OR
 *   - no high-stakes event AND no heavy-load day (back-to-back < 4h), OR
 *   - travel-landing protected window is active.
 *
 * Fire (no-CTA, in-body 1-2min reframe) when:
 *   - 30 ≤ gap ≤ 60, AND
 *   - next event is high-stakes, OR remaining day is heavy load.
 * Priority: high-stakes wins severity over heavy-load.
 */
export function meetingPrepCliff(ctx: RuleContext): BehaviourFlag | null {
  if (travelLandingProtected(ctx)) return null;

  const gap = ctx.nextPreEventGap;
  if (!gap) return null;
  if (gap.gapMinutes < 30 || gap.gapMinutes > 60) return null;

  const nextIsHighStakes =
    Boolean(gap.nextEventStakes) || isHighStakesTitle(gap.nextEventTitle);
  const heavyLoad =
    (ctx.backToBackHoursToday ?? 0) >= 4 ||
    (ctx.signals.backToBackHoursAggregated ?? 0) >= 4;

  if (!nextIsHighStakes && !heavyLoad) return null;

  return {
    rule: "meetingPrepCliff",
    severity: nextIsHighStakes ? "high" : "medium",
    evidence: [
      `gap ${gap.gapMinutes}min`,
      nextIsHighStakes ? "next high-stakes" : "heavy load remaining",
    ],
    anchorEvent: gap.nextEventTitle,
    stake: nextIsHighStakes ? "Executive Presence" : "Mental Bandwidth",
    copyHint: nextIsHighStakes
      ? "no app-open CTA — full micro-reframe in body (1-2min); name the meeting, name one regulating action, end clean"
      : "no app-open CTA — one in-body somatic to clear the residue between meetings; do not invite planning",
  };
}