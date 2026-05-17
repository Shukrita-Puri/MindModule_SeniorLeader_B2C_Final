/**
 * CLUSTER: Weekend (Sat + Sun)
 * SOURCE: doc §5.2 rows "Weekend morning anchor" / "Sunday reset" + user direction.
 *
 * APPLICATION (sub-case ladder — Batch 2 will implement):
 * - BRIEF: cluster pill — "Weekend · restoring" / "Weekend · work block ahead" /
 *          "Sunday · week-ahead anchor".
 * - PLAN:  light-touch suppresses slot 2+3 boosts; work-block boosts `prepare` into
 *          the slot before block start; full-working-weekend → identical to weekday.
 * - NUDGE: timing override — light-touch 08:30-10:00 local; work-block / meeting
 *          variants 60-90min before; Sunday afternoon variant 17:00-19:00.
 *
 * SUB-CASES (evaluated in order; first match wins):
 *   1. Travel active → null (let travel.ts carry)
 *   2. PTO/holiday + no meeting → null (let pto-holiday.ts carry)
 *   3. Full working weekend (≥3 meetings spread across day) → `fullWorkingWeekend`
 *   4. Weekend morning + work meeting in next 90min → `weekendWithMeeting`
 *   5. Weekend large work-block (title matches WORK_BLOCK_RX) → `weekendDeepWorkBlock`
 *   6. Sunday afternoon/evening (Sun 14:00+) → `sundayEveningWeekAhead`
 *   7. Sat/Sun morning, no work → `weekendMorningLightTouch`
 *
 * SIGNALS CONSUMED: dayOfWeek, localHour, hasWorkMeetingOnWeekend,
 *                   weekendMeetingCountToday, weekendWorkBlockToday, travelLandingDetected,
 *                   travelDay, ptoTodayAllDay, holidayAllDayEventToday.
 * OVERRIDES: yields to Travel; co-exists with sundayReset (different sub-window).
 */

// Batch 2 will implement: weekendMorningLightTouch, weekendWithMeeting,
// fullWorkingWeekend, weekendDeepWorkBlock, sundayEveningWeekAhead.

export {};