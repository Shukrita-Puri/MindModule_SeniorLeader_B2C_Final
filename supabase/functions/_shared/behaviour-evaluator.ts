// OWNERSHIP: engineering. Orchestrator. Runs every §2.11–§2.17 rule and returns
// the BehaviourFlags ordered by severity, deduped by rule, ready to drop into a
// BriefContext.
//
// This is the function brief / nudges / plan consume. Never bypass it by
// importing a single rule directly — keep the contract single-entry.

import type {
  BehaviourFlag,
  RuleContext,
  Severity,
  SlotBoost,
} from "./brief-context.ts";
import { ALL_RULES } from "./ceo-behaviour-rules.ts";

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/**
 * Run all CEO behaviour rules over the context. Returns flags sorted by
 * severity (high → low), with at most one flag per rule (rule is the dedup key).
 */
export function evaluate(ctx: RuleContext): BehaviourFlag[] {
  const flags: BehaviourFlag[] = [];
  for (const rule of ALL_RULES) {
    const flag = rule(ctx);
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
  for (const f of flags) {
    if (f.rule === "vetoRisk" && f.severity === "high") {
      boosts.push({
        slot: "start_of_day",
        practiceType: "regulate",
        reason: "vetoRisk",
        severity: "high",
      });
    } else if (f.rule === "postPeakHangover" && f.severity === "high") {
      boosts.push({
        slot: "end_of_day",
        practiceType: "integrate",
        reason: "postPeakHangover",
        severity: "high",
      });
    } else if (f.rule === "circadianPriority" && f.severity === "high") {
      boosts.push({
        slot: "start_of_day",
        practiceType: "regulate",
        reason: "circadianPriority",
        severity: "high",
      });
    }
  }
  return boosts;
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