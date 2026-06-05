// OWNERSHIP: engineering. Orchestrator. Runs every §2.11–§2.17 rule and returns
// the BehaviourFlags ordered by severity, deduped by rule, ready to drop into a
// BriefContext.
//
// This is the function brief / nudges / plan consume. Never bypass it by
// importing a single rule directly — keep the contract single-entry.

import type {
  BehaviourFlag,
  RuleContext,
  RuleScope,
  Severity,
  SlotBoost,
} from "./brief-context.ts";
import { ALL_RULES } from "./ceo-behaviour/index.ts";
import { PRACTICE_TYPE_TO_COMBO } from "./protocols/protocol-combos.ts";

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/**
 * Run all CEO behaviour rules over the context. Returns flags sorted by
 * severity (high → low), with at most one flag per rule (rule is the dedup key).
 *
 * Pass `{ scope }` to restrict to rules tagged for that surface — `"brief"`,
 * `"nudge"`, or `"plan"`. Omit to run every rule.
 */
export function evaluate(
  ctx: RuleContext,
  opts: { scope?: RuleScope } = {},
): BehaviourFlag[] {
  const flags: BehaviourFlag[] = [];
  for (const rule of ALL_RULES) {
    if (opts.scope && !rule.scopes.includes(opts.scope)) continue;
    const flag = rule.fn(ctx);
    if (flag) flags.push(flag);
  }
  return flags.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

/**
 * Derive Plan slot boosts from active flags. Consumed by `generate-mastery-plan`
 * only; the Brief and nudges ignore the result.
 *
 * Boost rules:
 * - vetoRisk.high   → Pause module into slot 1 (start_of_day, regulate)
 * - postPeakHangover.high → Reenergise module into slot 3 (end_of_day, integrate)
 * - circadianPriority.high → regulate practice at start_of_day
 */
export function deriveSlotBoosts(flags: BehaviourFlag[]): SlotBoost[] {
  const boosts: SlotBoost[] = [];
  // Registry-driven path: any rule that declared a `slotBoost` descriptor in
  // ALL_RULES participates automatically. Adding a new behaviour with a boost
  // descriptor wires it into the Plan with zero edits here.
  const byRule = new Map<string, BehaviourFlag>();
  for (const f of flags) byRule.set(f.rule, f);
  for (const rule of ALL_RULES) {
    if (!rule.slotBoost) continue;
    const flag = byRule.get((rule.id ?? rule.fn.name) as BehaviourFlag["rule"]);
    if (!flag) continue;
    const allowed = rule.slotBoost.severities ?? ["high"];
    if (!allowed.includes(flag.severity)) continue;
    boosts.push(withCombo({
      slot: rule.slotBoost.slot,
      practiceType: rule.slotBoost.practiceType,
      reason: flag.rule,
      severity: flag.severity,
    }));
  }
  // Legacy hardcoded boosts (kept for backward compat with existing tests).
  for (const f of flags) {
    if (f.rule === "vetoRisk" && f.severity === "high") {
      boosts.push(withCombo({
        slot: "start_of_day",
        practiceType: "regulate",
        reason: "vetoRisk",
        severity: "high",
      }));
    } else if (f.rule === "postPeakHangover" && f.severity === "high") {
      boosts.push(withCombo({
        slot: "end_of_day",
        practiceType: "integrate",
        reason: "postPeakHangover",
        severity: "high",
      }));
    } else if (f.rule === "circadianPriority" && f.severity === "high") {
      boosts.push(withCombo({
        slot: "start_of_day",
        practiceType: "regulate",
        reason: "circadianPriority",
        severity: "high",
      }));
    } else if (
      (f.rule === "travelPreFlightMandatory" ||
        f.rule === "travelLandingOffload" ||
        f.rule === "longHaulRecovery") &&
      (f.severity === "high" || f.severity === "medium")
    ) {
      boosts.push(withCombo({
        slot: f.rule === "longHaulRecovery" ? "end_of_day" : "start_of_day",
        practiceType: "regulate",
        reason: f.rule,
        severity: f.severity,
      }));
    } else if (
      (f.rule === "advancePrep24h" || f.rule === "travelLandingPlusHighStakes") &&
      (f.severity === "high" || f.severity === "medium")
    ) {
      boosts.push(withCombo({
        slot: "midday",
        practiceType: "prepare",
        reason: f.rule,
        severity: f.severity,
      }));
    } else if (f.rule === "weekendDeepWorkBlock") {
      boosts.push(withCombo({
        slot: "midday",
        practiceType: "prepare",
        reason: "weekendDeepWorkBlock",
        severity: f.severity,
      }));
    } else if (f.rule === "fullWorkingWeekend" && f.severity === "high") {
      boosts.push(withCombo({
        slot: "start_of_day",
        practiceType: "align",
        reason: "fullWorkingWeekend",
        severity: "high",
      }));
    } else if (f.rule === "sundayEveningWeekAhead") {
      boosts.push(withCombo({
        slot: "end_of_day",
        practiceType: "align",
        reason: "sundayEveningWeekAhead",
        severity: f.severity,
      }));
    } else if (f.rule === "backToBackLoadOverride" && f.severity === "high") {
      boosts.push(withCombo({
        slot: "midday",
        practiceType: "regulate",
        reason: "backToBackLoadOverride",
        severity: "high",
      }));
    }
  }
  return boosts;
}

/** Attach §2 protocol+mode via PRACTICE_TYPE_TO_COMBO (single source of truth). */
function withCombo(b: SlotBoost): SlotBoost {
  const combo = PRACTICE_TYPE_TO_COMBO[b.practiceType];
  return { ...b, protocol: combo.protocol, mode: combo.mode };
}

/** Convenience: highest-severity flag for a given anchor event title, or null. */
export function flagForAnchor(
  flags: BehaviourFlag[],
  anchorTitle: string,
): BehaviourFlag | null {
  for (const f of flags) {
    if (f.anchorEvent && f.anchorEvent === anchorTitle) return f;
  }
  return null;
}