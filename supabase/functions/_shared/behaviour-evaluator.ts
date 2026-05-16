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
import { ALL_RULES } from "./ceo-behaviour-rules.ts";
import { PRACTICE_TYPE_TO_COMBO } from "./event-protocol-taxonomy.ts";

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