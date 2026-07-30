/**
 * CLUSTER: Daily Rhythm & Baseline
 * SOURCE: docs/CEO_BEHAVIOUR_RULE_MAP.md — baseline behaviour pair (morning
 * intent + evening shutdown) that anchors the day when no higher-precedence
 * rule has fired.
 *
 * DESIGN: deliberately low-severity and low-noise. These rules give the
 * Brief/Plan/Nudge surfaces a guaranteed default frame on otherwise quiet days
 * so the system never goes silent on a regular workday.
 *
 * APPLICATION:
 * - BRIEF: open with one-line intent (AM) or close (PM).
 * - PLAN:  `align` boost in slot 1 (AM) or slot 3 (PM).
 * - NUDGE: brief-prompt nudge family; subject to user preference layer.
 *
 * SUPPRESSION: never fires on PTO/travel/conference days, or when any of the
 * higher-severity cluster rules (vetoRisk, boardLevelOutcome, travel, conf,
 * weekend, advancePrep24h) have own anchors on the same surface. The
 * suppression is structural — these rules read context only, not other flags,
 * so suppression is enforced by gating on the same context signals upstream.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";
import { planningDayOfWeek } from "../plan/user-locale.ts";

function isQuietWeekday(ctx: RuleContext): boolean {
  const weekendDays = planningDayOfWeek(ctx.homeCountry) === 6 ? [5, 6] : [0, 6];
  if (typeof ctx.dayOfWeek === "number" && weekendDays.includes(ctx.dayOfWeek)) return false;
  const s = ctx.signals;
  if (s.travelDay || s.travelLandingDetected) return false;
  if (s.ptoModeToday) return false;
  if (typeof s.conferenceDayNumber === "number") return false;
  if (s.isHighVisibilityToday) return false;
  if (s.highStakesEventInNext24h && s.highStakesEventInNext24h.minutesUntil <= 4 * 60) return false;
  return true;
}

/** Morning baseline — first window of the day on a quiet weekday. */
export function morningBaseline(ctx: RuleContext): BehaviourFlag | null {
  if (!isQuietWeekday(ctx)) return null;
  if (ctx.localHour < 5 || ctx.localHour >= 12) return null;
  return {
    rule: "morningBaseline",
    severity: "low",
    evidence: ["quiet weekday morning"],
    stake: "Operational Drive",
    copyHint:
      "baseline morning · set one intent and one boundary for the day; Mindset-Flow short form to clear residual sleep inertia · open-brief",
  };
}

/** Evening shutdown — close of work day on a quiet weekday. */
export function eveningShutdown(ctx: RuleContext): BehaviourFlag | null {
  if (!isQuietWeekday(ctx)) return null;
  if (ctx.localHour < 17 || ctx.localHour >= 22) return null;
  // weekly planning reset owns the locale-specific planning-day evening.
  if (ctx.dayOfWeek === planningDayOfWeek(ctx.homeCountry)) return null;
  return {
    rule: "eveningShutdown",
    severity: "low",
    evidence: ["quiet weekday evening"],
    stake: "Physical Recovery",
    copyHint:
      "shutdown ritual · name the day's close, capture one carry-forward, Somatic-Pause to detach from work residue before sleep window · open-brief",
  };
}
