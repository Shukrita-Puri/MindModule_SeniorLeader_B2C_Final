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
import { isHighStakesTitle } from "../events/event-classifier.ts";
import {
  PTO_TITLE_RX as _PTO_TITLE_RX,
  PERSONAL_HOLIDAY_TITLE_RX as _PERSONAL_HOLIDAY_TITLE_RX,
} from "../availability/availability-classifier.ts";

/**
 * @deprecated Import `PTO_TITLE_RX` from
 * `_shared/availability/availability-classifier.ts` — that file is now the
 * single source of truth for availability primitives. This re-export is a
 * back-compat shim; the CI-gated shim-import guard will fail the build if
 * a new file imports the regex from here.
 */
export const PTO_TITLE_RX = _PTO_TITLE_RX;

/** Convenience predicate over the canonical PTO/holiday regex. */
export function isPtoOrHolidayTitle(title: string | null | undefined): boolean {
  return !!title && PTO_TITLE_RX.test(title);
}

/**
 * @deprecated Import `PERSONAL_HOLIDAY_TITLE_RX` from
 * `_shared/availability/availability-classifier.ts` (SSOT). This is a
 * back-compat re-export.
 */
export const PERSONAL_HOLIDAY_TITLE_RX = _PERSONAL_HOLIDAY_TITLE_RX;

export function isPersonalHolidayTitle(title: string | null | undefined): boolean {
  return !!title && PERSONAL_HOLIDAY_TITLE_RX.test(title);
}

function ptoActive(ctx: RuleContext): boolean {
  // SSOT override: when the availability classifier has already decided
  // this is NOT a PTO/holiday rest day (e.g. foreign FYI holiday, or
  // work-evidence override), suppress reduced-touch framing.
  const availState = (ctx as unknown as { availability?: { state?: string; isRestDay?: boolean } })
    .availability;
  if (availState && typeof availState.isRestDay === 'boolean') {
    return availState.state === 'PTO' || availState.state === 'PUBLIC_HOLIDAY';
  }
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