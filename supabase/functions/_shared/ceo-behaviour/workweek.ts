/**
 * CLUSTER: Workweek (Mon-Fri standard CEO operating mode)
 * SOURCE: doc §2.11 – §2.17, §5.2 (sundayReset, notificationIsProduct)
 *
 * APPLICATION:
 * - BRIEF: copyHint sets the framing — name the gap, tie state to a Leadership Variable.
 * - PLAN:  severity drives slot-boost magnitude; rule name maps to practiceType in
 *          generate-mastery-plan (regulate / align / prepare / integrate).
 * - NUDGE: cadence default; sundayReset and notificationIsProduct override timing.
 *
 * SIGNALS CONSUMED: SignalMatrix.* (wearable, emotional, calendar), RuleContext.localHour,
 *                   dayOfWeek, backToBackHoursToday, historicalAppOpenRateLow.
 * OVERRIDES: yields to Travel cluster (Batch 2) when travelLandingDetected || travelDay.
 * NOT IN MVP: personalFrictionInference remains a stub until 3-week history store ships.
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

// --- §2.11 Veto Risk Rule (Masked Fatigue) -----------------------------------
export function vetoRisk(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  const hrvCompressed =
    typeof signals.hrvDeviationPct === "number" && signals.hrvDeviationPct <= -15;
  const sleepCompressed = signals.sleepBelow6h === true;
  const rhrElevated =
    typeof signals.rhrDeviationPct === "number" && signals.rhrDeviationPct >= 10;

  const wearableCompressed = hrvCompressed || sleepCompressed || rhrElevated;

  const feltStrong =
    (typeof signals.mentalSharpness === "number" && signals.mentalSharpness >= 4) ||
    (typeof signals.confidence === "number" && signals.confidence >= 4);

  if (!wearableCompressed || !feltStrong) return null;

  const evidence: string[] = [];
  if (hrvCompressed) evidence.push(`HRV ${signals.hrvDeviationPct}%`);
  if (sleepCompressed && typeof signals.sleepHours === "number") {
    evidence.push(`sleep ${signals.sleepHours.toFixed(1)}h`);
  }
  if (rhrElevated) evidence.push(`RHR +${signals.rhrDeviationPct}%`);
  if (typeof signals.mentalSharpness === "number") {
    evidence.push(`sharpness ${signals.mentalSharpness}/5`);
  } else if (typeof signals.confidence === "number") {
    evidence.push(`confidence ${signals.confidence}/5`);
  }

  const stackCount =
    Number(hrvCompressed) + Number(sleepCompressed) + Number(rhrElevated);
  const severity: Severity =
    stackCount >= 2 || signals.isHighVisibilityToday ? "high" : "medium";

  const anchor = signals.highStakesEventInNext24h;
  return {
    rule: "vetoRisk",
    severity,
    evidence,
    anchorEvent: anchor?.title,
    stake: signals.isHighVisibilityToday ? "Executive Presence" : "Decision Power",
    copyHint:
      "name the mask — felt-state is high while the body is compressed; tie risk to the next high-stakes block, do not validate the felt confidence",
  };
}

// --- §2.12 Second Wind -------------------------------------------------------
export function secondWind(ctx: RuleContext): BehaviourFlag | null {
  const { signals, localHour } = ctx;
  if (!signals.morningWasCompressed) return null;
  if (!signals.middayRecoveryDetected) return null;
  if (localHour < 11 || localHour >= 17) return null;

  const nextHighStakes = signals.highStakesEventInNext24h;
  if (nextHighStakes && nextHighStakes.minutesUntil <= 90) return null;

  return {
    rule: "secondWind",
    severity: "low",
    evidence: ["morning compressed", "midday recovery"],
    stake: "Mental Bandwidth",
    copyHint:
      "acknowledge the lift, orient to one constructive deployment window before the next demand — do not expand the day",
  };
}

// --- §2.13 Circadian Priority (Travel & Time-Zone Drift) ---------------------
export function circadianPriority(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  const shift = signals.timezoneShift48hHours;
  const drifted = typeof shift === "number" && Math.abs(shift) >= 3;
  if (!drifted && !signals.travelDay) return null;

  const evidence: string[] = [];
  if (drifted) evidence.push(`TZ drift ${shift}h/48h`);
  if (signals.travelDay) evidence.push("travel day");

  return {
    rule: "circadianPriority",
    severity: drifted && signals.travelDay ? "high" : "medium",
    evidence,
    stake: "Operational Drive",
    copyHint:
      "override default cadence — anchor the brief to circadian re-entry, not generic energy management",
  };
}

// --- §2.14 Decision Leakage Guard (Emotional Labor) — DUAL-SOURCE TRIGGER ----
export function decisionLeakageGuard(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  const drainEvent = signals.emotionalDrainEventInNext4h;
  if (!drainEvent) return null;

  const wearableProxy =
    signals.hrElevatedProxy ||
    (typeof signals.hrvDeviationPct === "number" && signals.hrvDeviationPct <= -15);

  const selfDecl =
    signals.emotionalSelfDeclared === "depleted" ||
    signals.emotionalSelfDeclared === "managing";

  if (!wearableProxy && !selfDecl) return null;

  const evidence: string[] = [];
  if (signals.hrElevatedProxy) evidence.push("HR elevated proxy");
  if (typeof signals.hrvDeviationPct === "number" && signals.hrvDeviationPct <= -15) {
    evidence.push(`HRV ${signals.hrvDeviationPct}%`);
  }
  if (selfDecl) evidence.push(`self-decl ${signals.emotionalSelfDeclared}`);

  const severity: Severity = wearableProxy && selfDecl ? "high" : "medium";

  return {
    rule: "decisionLeakageGuard",
    severity,
    evidence,
    anchorEvent: drainEvent.title,
    stake: "Internal Buffer",
    copyHint:
      `name the leakage risk and tie it to "${drainEvent.title}" — frame as Resilience pillar, not Physiology`,
  };
}

// --- §2.16 Personal Friction Inference (STUB) -------------------------------
export function personalFrictionInference(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}

// --- §2.14b Decision Leakage Guard — PLAN scope (Batch 4) -------------------
// Wider 24h window for plan-shaping. Mirrors legacy `decision_leakage` in
// generate-mastery-plan (lines ~3195–3370). Mood × HRV fusion stays in Edge:
// this rule only fires the shape; Edge decides whether to surface it.
export function decisionLeakageGuardPlan(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  const drainEvent = signals.emotionalDrainEventInNext24h;
  if (!drainEvent) return null;

  // Suppress if the narrower next-4h rule will already fire — keeps surfaces
  // from double-counting. decisionLeakageGuard owns brief/nudge framing inside
  // the 4h window; plan-scope rule covers the 4–24h tail.
  if (signals.emotionalDrainEventInNext4h) return null;

  return {
    rule: "decisionLeakageGuardPlan",
    severity: "medium",
    evidence: [`drain event in ${drainEvent.minutesUntil}min (24h window)`],
    anchorEvent: drainEvent.title,
    stake: "Internal Buffer",
    copyHint:
      `reserve a regulate slot ahead of "${drainEvent.title}" — protect decision quality across the tail of the day`,
  };
}

// --- §2.17 Board-Level Outcome ----------------------------------------------
export function boardLevelOutcome(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (!signals.isHighVisibilityToday) return null;
  const anchor = signals.highStakesEventInNext24h;

  return {
    rule: "boardLevelOutcome",
    severity: anchor && anchor.minutesUntil <= 240 ? "high" : "medium",
    evidence: anchor ? [`high-stakes in ${anchor.minutesUntil}min`] : ["high-stakes in next 24h"],
    anchorEvent: anchor?.title,
    stake: "Executive Presence",
    copyHint:
      "link state to a Leadership Variable — 'Protect Executive Presence for [event]' beats 'Save your energy'",
  };
}

// --- §5.2 Sunday Reset Non-Negotiable (Sun 18:00–21:00 sub-window) ----------
// NOTE: Batch 2 adds `sundayEveningWeekAhead` (Sun 14:00+) as the broader frame;
// this rule remains the mandatory restore-and-prime window.
export function sundayReset(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.dayOfWeek !== 0) return null;
  if (ctx.localHour < 18 || ctx.localHour >= 21) return null;
  return {
    rule: "sundayReset",
    severity: "medium",
    evidence: ["Sunday evening reset window"],
    stake: "Operational Drive",
    copyHint:
      "orient to week-ahead as a readiness asset; prime Monday, do not invite Sunday-anxiety spiral",
  };
}

// --- §5.2 Notification IS the Product (nudge-only) --------------------------
// NOTE: Batch 2 adds `meetingPrepCliff` which fires the same copy contract on
// gap-structure (5/15/30min). This rule stays as the historical-pattern trigger.
export function notificationIsProduct(ctx: RuleContext): BehaviourFlag | null {
  const dense = (ctx.backToBackHoursToday ?? 0) >= 4;
  if (!dense || !ctx.historicalAppOpenRateLow) return null;
  return {
    rule: "notificationIsProduct",
    severity: "medium",
    evidence: [
      `back-to-back ${ctx.backToBackHoursToday}h`,
      "low historical open rate",
    ],
    stake: "Mental Bandwidth",
    copyHint:
      "the nudge IS the value — write a complete micro-reframe in the body; do not invite app open",
  };
}