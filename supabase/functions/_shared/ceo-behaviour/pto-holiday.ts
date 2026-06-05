/**
 * CLUSTER: PTO / Public Holiday
 * SOURCE: doc §5.2 row "Holiday reduced touch" + user direction.
 *
 * APPLICATION (Batch 2):
 * - BRIEF: reduced-touch framing; do not surface load.
 * - PLAN:  suppress all slot boosts; one light cue only.
 * - NUDGE: morning-only; no afternoon/evening notifications.
 *
 * DETECTION: all-day calendar event whose title matches /OOO|PTO|Vacation|Holiday|Out of Office/i.
 * FALLBACK: if PTO day contains a meeting → `ptoWithMeetingFallback` reverts to standard
 *           pre-meeting framing for that meeting only.
 *
 * SIGNALS CONSUMED: signals.ptoTodayAllDay, ctx.holidayAllDayEventToday,
 *                   ctx.upcomingEvents (for fallback).
 * OVERRIDES: yields to Travel.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";
import { isHighStakesTitle } from "../executive-state-taxonomy.ts";

/**
 * Canonical PTO / public-holiday title regex. Single source of truth for
 * detecting whether a calendar event title represents an off-day marker
 * (OOO / PTO / Vacation / Holiday / Out of Office).
 *
 * Consumers (brief-signal-coverage, generate-mastery-plan, smart-nudges)
 * MUST import this rather than re-declaring local PTO/holiday regexes.
 * Mirrors the detection rule documented in the module header.
 */
export const PTO_TITLE_RX =
  /\b(ooo|out\s*of\s*office|pto|vacation|annual\s+leave|on\s+leave|holiday|public\s+holiday|bank\s+holiday|national\s+holiday)\b/i;

/** Convenience predicate over the canonical PTO/holiday regex. */
export function isPtoOrHolidayTitle(title: string | null | undefined): boolean {
  return !!title && PTO_TITLE_RX.test(title);
}

/**
 * Personal-leaning subset of {@link PTO_TITLE_RX}: vacation / annual leave /
 * on leave / public|bank|national holiday / plain "holiday". Excludes
 * OOO|PTO|out of office which often still imply a work-arc. Single source of
 * truth for `personalHolidayInferred` detection — imported by
 * brief-signal-coverage AND the plan generator's post-holiday selector.
 */
export const PERSONAL_HOLIDAY_TITLE_RX =
  /\b(vacation|annual\s+leave|on\s+leave|public\s+holiday|bank\s+holiday|national\s+holiday|holiday)\b/i;

export function isPersonalHolidayTitle(title: string | null | undefined): boolean {
  return !!title && PERSONAL_HOLIDAY_TITLE_RX.test(title);
}

function ptoActive(ctx: RuleContext): boolean {
  return (
    ctx.signals.ptoTodayAllDay === true ||
    ctx.holidayAllDayEventToday != null
  );
}

function travelActive(ctx: RuleContext): boolean {
  return ctx.signals.travelDay === true || ctx.signals.travelLandingDetected === true;
}

/** PTO/holiday with no meeting today — single morning anchor, no afternoon/evening nudges. */
export function holidayReducedTouch(ctx: RuleContext): BehaviourFlag | null {
  if (travelActive(ctx)) return null;
  if (!ptoActive(ctx)) return null;

  const hasMeeting = ctx.upcomingEvents.some(
    (e) => e.minutesUntil >= 0 && (Boolean(e.stakesLevel) || isHighStakesTitle(e.title)),
  );
  if (hasMeeting) return null; // ptoWithMeetingFallback owns this case

  return {
    rule: "holidayReducedTouch",
    severity: "low",
    evidence: [
      ctx.signals.ptoTodayAllDay ? "PTO all-day" : "holiday all-day",
    ],
    stake: "Internal Buffer",
    copyHint:
      "off-day frame — one light cue at morning only; suppress load language and any pre-meeting framing",
  };
}

/** PTO/holiday but a real meeting slipped in — restore standard pre-meeting framing for that meeting only. */
export function ptoWithMeetingFallback(ctx: RuleContext): BehaviourFlag | null {
  if (travelActive(ctx)) return null;
  if (!ptoActive(ctx)) return null;

  const meeting = ctx.upcomingEvents.find(
    (e) => e.minutesUntil >= 0 && (Boolean(e.stakesLevel) || isHighStakesTitle(e.title)),
  );
  if (!meeting) return null;

  return {
    rule: "ptoWithMeetingFallback",
    severity: "medium",
    evidence: ["PTO with work meeting", `in ${meeting.minutesUntil}min`],
    anchorEvent: meeting.title,
    stake: "Executive Presence",
    copyHint:
      "off-day frame but the meeting is real — prep it cleanly then return to off-day; do not let it rebuild a workday around itself",
  };
}