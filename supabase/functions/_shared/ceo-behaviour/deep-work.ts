/**
 * CLUSTER: Deep Work & Strategy (category E)
 * SOURCE: docs/CEO_BEHAVIOUR_RULE_MAP.md + §3 event taxonomy category E
 *         (deep work, strategy block, planning, write/build block ≥90 min).
 *
 * APPLICATION:
 * - BRIEF: name the block as protected, not "free time"; pair with single-thread framing.
 * - PLAN:  `prepare` (Mindset-Flow §4 E-pre) immediately before the block.
 * - NUDGE: T-10 single-thread reminder; suppress JIT inside the block (handled
 *          by the JIT layer reading the same rule output).
 *
 * COMPLEMENTS: `weekendDeepWorkBlock` covers Sat/Sun. This rule covers weekdays
 * and never co-fires with it (weekend cluster owns that surface).
 */

import type { BehaviourFlag, RuleContext, Severity } from "../brief-context.ts";

export function deepWorkProtection(ctx: RuleContext): BehaviourFlag | null {
  // Weekend cluster owns Sat/Sun; let it lead to avoid double-naming.
  if (ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6) return null;
  if (ctx.signals.travelLandingDetected || ctx.signals.travelDay) return null;
  if (ctx.signals.ptoModeToday) return null;

  const block = ctx.upcomingEvents
    .filter((e) => e.categoryId === "E")
    .filter((e) => typeof e.durationMinutes === "number" && (e.durationMinutes ?? 0) >= 90)
    .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= 6 * 60)
    .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
  if (!block) return null;

  const severity: Severity = block.minutesUntil <= 30 ? "medium" : "low";
  return {
    rule: "deepWorkProtection",
    severity,
    evidence: [`deep-work block in ${Math.round(block.minutesUntil / 15) * 15}m`, `${block.durationMinutes}m duration`],
    anchorEvent: block.title,
    stake: "Mental Bandwidth",
    copyHint:
      "protect the block · single-thread the chosen problem; clear context-switch residue T-10 with Mindset-Flow; exit with Somatic-Pause to prevent flow-out into reactive load · open-plan",
  };
}