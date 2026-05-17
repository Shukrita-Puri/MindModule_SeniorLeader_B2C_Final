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

// Batch 2 will implement: holidayReducedTouch, ptoWithMeetingFallback.

export {};