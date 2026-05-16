// OWNERSHIP: engineering. Trigger logic / thresholds change via code review only.
// Do not edit in a chat-driven session without an explicit human request.
//
// One pure function per §2.11–§2.17 rule from the CEO Self-Regulation Framework
// (Decision_Readiness_Brief_LLM_Prompt v6.1). Each returns a BehaviourFlag or
// null. Severity drives Plan slot-boost magnitude and Brief copy priority.
//
// These functions are read-only over RuleContext. Side effects, fetches, and
// LLM calls live in the consumer edge functions.

import type {
  BehaviourFlag,
  RuleContext,
  ScopedRule,
  Severity,
} from "./brief-context.ts";

// --- §2.11 Veto Risk Rule (Masked Fatigue) -----------------------------------
// Trigger: wearable shows compressed recovery (HRV negative deviation OR sleep
// <6h OR RHR elevated) AND self-declared confidence/sharpness reads HIGH.
// Behaviour: name the gap. High felt-state on a depleted system → Decision
// Leakage risk on today's highest-stakes event.
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

  // Severity climbs when multiple wearable signals stack OR a high-stakes event
  // is in the next 24h.
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
// Trigger: midday/afternoon recovery on a morning that started compressed AND
// no high-stakes event in the next 90 minutes.
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
// Trigger: timezone offset has shifted ≥3 hours in last 48h OR travelDay flag.
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
// Trigger (v6.1 expanded): (wearable emotional proxy: HR elevated OR HRV
// deviation < -15%) OR (self-declared emotional state ∈ {depleted, managing})
// AND calendar contains an emotional/diplomatic drain event in the next 4h.
// CRITICAL: if wearable signal is null/stale, the self-declared state CARRIES.
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

// --- §2.15 Post-Peak Hangover ------------------------------------------------
// Trigger: yesterday score was high (≥75) AND today's wearable shows recovery
// deficit OR clarity slider drops ≥2 points vs trailing 7-day average.
export function postPeakHangover(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (typeof signals.yesterdayScore !== "number" || signals.yesterdayScore < 75) {
    return null;
  }

  const recoveryDeficit =
    (typeof signals.hrvDeviationPct === "number" && signals.hrvDeviationPct <= -10) ||
    signals.sleepBelow6h ||
    (typeof signals.rhrDeviationPct === "number" && signals.rhrDeviationPct >= 8);

  const clarityDrop =
    typeof signals.clarityDropFromTrailingAvg === "number" &&
    signals.clarityDropFromTrailingAvg <= -2;

  if (!recoveryDeficit && !clarityDrop) return null;

  const evidence: string[] = [`yesterday ${signals.yesterdayScore}/100`];
  if (recoveryDeficit) evidence.push("recovery deficit");
  if (clarityDrop) evidence.push(`clarity ${signals.clarityDropFromTrailingAvg}`);

  return {
    rule: "postPeakHangover",
    severity: recoveryDeficit && clarityDrop ? "high" : "medium",
    evidence,
    stake: "Physical Recovery",
    copyHint:
      "reference yesterday's peak briefly, orient toward Hardware Recovery before the next high-stakes block — name the cost before directing",
  };
}

// --- §2.16 Personal Friction Inference --------------------------------------
// Trigger: pattern of declining self-decl on weekend-adjacent days (Sun pm /
// Mon am) without matching wearable degradation.
// STATUS: stub. Requires ≥3 weeks of per-user history. Returns null until the
// historical-pattern store exposes the required field. Wire in a follow-up.
export function personalFrictionInference(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}

// --- §2.17 Board-Level Outcome ----------------------------------------------
// Trigger: any high-stakes event flagged with stakes_level ∈ {board, external,
// investor} within next 24h. Every body copy in this window MUST link
// physical/cognitive state to a Leadership Variable.
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

// --- §5.2 Sunday Reset Non-Negotiable ---------------------------------------
// Fires Sun 18:00–21:00 local. Orients to week-ahead as a readiness asset,
// not an anxiety vector. Surfaces on brief, nudges, and plan.
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

// --- §5.2 Notification IS the Product ---------------------------------------
// Fires when today is ≥4h back-to-back AND the user's 7-day app-open rate is
// low. Nudge-only: instructs the copy layer to ship the entire micro-reframe
// in the notification body rather than inviting an app open the user won't do.
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

// --- Conference Depletion (multi-day stage time) — STUB ---------------------
// Returns null until ctx.conferenceDayNumber is populated. Same pattern as
// personalFrictionInference. When the `conference_day_number` schema field
// lands, only brief-signal-coverage.ts changes — this rule, the flag shape,
// and every downstream consumer remain identical.
export function conferenceDepletion(ctx: RuleContext): BehaviourFlag | null {
  const day = ctx.conferenceDayNumber;
  if (typeof day !== "number" || day < 2) return null;
  const severity: Severity = day >= 3 ? "high" : "medium";
  return {
    rule: "conferenceDepletion",
    severity,
    evidence: [`conference day ${day}`],
    stake: "Physical Recovery",
    copyHint:
      "name the cumulative cost of multi-day on-stage time; orient to recovery protection, not output expansion",
  };
}

/**
 * All rules + the surfaces each is allowed to fire on. Order does NOT imply
 * priority — severity does. behaviour-evaluator sorts the output.
 *
 * Add new behaviours by tagging scopes here, not by creating new rule files
 * per surface.
 */
export const ALL_RULES: ScopedRule[] = [
  { scopes: ["brief", "plan", "nudge"], fn: vetoRisk },
  { scopes: ["brief", "plan"],          fn: secondWind },
  { scopes: ["brief", "plan", "nudge"], fn: circadianPriority },
  { scopes: ["brief", "plan", "nudge"], fn: decisionLeakageGuard },
  { scopes: ["brief", "plan"],          fn: postPeakHangover },
  { scopes: ["brief"],                  fn: personalFrictionInference },
  { scopes: ["brief", "plan", "nudge"], fn: boardLevelOutcome },
  { scopes: ["brief", "plan", "nudge"], fn: sundayReset },
  { scopes: ["nudge"],                  fn: notificationIsProduct },
  { scopes: ["brief", "plan", "nudge"], fn: conferenceDepletion },
];