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

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";
import { isHighStakesTitle } from "../executive-state-taxonomy.ts";

function isWeekend(dow: number | undefined): boolean {
  return dow === 0 || dow === 6;
}

function travelActive(ctx: RuleContext): boolean {
  return ctx.signals.travelDay === true || ctx.signals.travelLandingDetected === true;
}

function ptoActive(ctx: RuleContext): boolean {
  return (
    ctx.signals.ptoTodayAllDay === true ||
    ctx.holidayAllDayEventToday != null
  );
}

/** Saturday/Sunday morning, no work meetings — protect rest, single light cue only. */
export function weekendMorningLightTouch(ctx: RuleContext): BehaviourFlag | null {
  if (!isWeekend(ctx.dayOfWeek)) return null;
  if (travelActive(ctx)) return null;
  if (ptoActive(ctx)) return null;
  if (ctx.localHour < 7 || ctx.localHour >= 11) return null;
  if (ctx.signals.hasWorkMeetingOnWeekend) return null;
  if ((ctx.signals.weekendMeetingCountToday ?? 0) > 0) return null;

  return {
    rule: "weekendMorningLightTouch",
    severity: "low",
    evidence: ["weekend morning", "no work meetings"],
    stake: "Internal Buffer",
    copyHint:
      "single light anchor — protect rest, do not invite a planning frame; the body needs nothing more from us today",
  };
}

/** Sat/Sun with a work meeting in next 90 min — pre-meeting prep wins. */
export function weekendWithMeeting(ctx: RuleContext): BehaviourFlag | null {
  if (!isWeekend(ctx.dayOfWeek)) return null;
  if (travelActive(ctx)) return null;
  // Full-working-weekend takes precedence (handled below in evaluator order).
  if ((ctx.signals.weekendMeetingCountToday ?? 0) >= 3) return null;
  if ((ctx.backToBackHoursToday ?? 0) >= 4) return null;

  const nextWorkInWindow = ctx.upcomingEvents.find(
    (e) =>
      e.minutesUntil >= 0 &&
      e.minutesUntil <= 90 &&
      (Boolean(e.stakesLevel) || isHighStakesTitle(e.title)),
  );
  if (!nextWorkInWindow) return null;

  return {
    rule: "weekendWithMeeting",
    severity: "medium",
    evidence: [
      "weekend with work meeting",
      `in ${nextWorkInWindow.minutesUntil}min`,
    ],
    anchorEvent: nextWorkInWindow.title,
    stake: "Executive Presence",
    copyHint:
      "weekend frame but the meeting is real — prime for it, then return to rest; do not let it bleed across the day",
  };
}

/** ≥3 meetings OR ≥4h back-to-back on Sat/Sun → treat as a weekday. */
export function fullWorkingWeekend(ctx: RuleContext): BehaviourFlag | null {
  if (!isWeekend(ctx.dayOfWeek)) return null;
  if (travelActive(ctx)) return null;
  const meetings = ctx.signals.weekendMeetingCountToday ?? 0;
  const back = ctx.backToBackHoursToday ?? 0;

  // A single high-stakes work block (deep work, pitch, strategy, etc.) on the
  // weekend also counts — per spec, any explicit work-block upgrades the day
  // to weekday cadence rather than light-touch.
  const hasWorkBlock =
    Boolean(ctx.signals.weekendWorkBlockToday) ||
    ctx.upcomingEvents.some(
      (e) =>
        (e.startsAtMinutesFromNow ?? e.minutesUntil ?? -1) >= -240 &&
        (Boolean(e.stakesLevel) || isHighStakesTitle(e.title)),
    );

  if (meetings < 3 && back < 4 && !hasWorkBlock) return null;

  const evidence: string[] = [];
  if (meetings >= 1) evidence.push(`${meetings} meetings`);
  if (back >= 4) evidence.push(`back-to-back ${back}h`);
  if (hasWorkBlock && meetings < 3 && back < 4) evidence.push("weekend work block");

  return {
    rule: "fullWorkingWeekend",
    severity: meetings >= 4 || back >= 6 ? "high" : "medium",
    evidence: evidence.length ? evidence : ["weekend work load"],
    stake: "Operational Drive",
    copyHint:
      "this is a working weekend in fact — drop the weekend framing, run weekday cadence, then schedule one true off-block",
  };
}

/**
 * RETIRED as a primary flag: a single weekend high-stakes block now upgrades
 * directly to `fullWorkingWeekend`. Kept exported as a no-op so the registry
 * stays stable; remove in a later cleanup once downstream telemetry confirms
 * no consumer is reading the flag directly.
 */
export function weekendDeepWorkBlock(ctx: RuleContext): BehaviourFlag | null {
  void ctx;
  return null;
}

/** Sunday 14:00+ — broader week-ahead anchor (sundayReset still owns 18-21 sub-window). */
export function sundayEveningWeekAhead(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.dayOfWeek !== 0) return null;
  if (travelActive(ctx)) return null;
  if (ctx.localHour < 14) return null;
  // Let the narrower sundayReset (18-21) own that exact window.
  if (ctx.localHour >= 18 && ctx.localHour < 21) return null;

  const next24h = ctx.signals.highStakesEventInNext24h;
  return {
    rule: "sundayEveningWeekAhead",
    severity: next24h ? "medium" : "low",
    evidence: ["Sunday afternoon/evening"],
    anchorEvent: next24h?.title,
    stake: "Operational Drive",
    copyHint:
      "settle the body first, then let prep happen — do not assume anxiety; the user may simply want to be ready. Specific framing (sleep-deprived, heavy weekend, low HRV, busy week ahead) is triangulated downstream in LLM/Edge, not here",
  };
}