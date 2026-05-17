/**
 * CLUSTER: Upward reporting (STUB — Batch 3)
 * SOURCE: user spec — when the user has flagged a priority/event as
 * "reporting upward" (board, CEO, chair, investor update), apply the same
 * preparation arc as board-level outcome but with an additional emphasis on
 * narrative discipline (one story, three numbers) rather than recovery-only.
 *
 * APPLICATION (when detector lands):
 * - BRIEF: distinguish from peer-facing high-stakes — "reporting up" framing.
 * - PLAN:  prepare (mindset) > regulate; rehearsal-flavoured.
 * - NUDGE: 24h advance prep + 60-min pre-event reframe focused on signal-to-noise.
 *
 * RULES: upwardReporting
 *
 * SIGNALS REQUIRED:
 *   userMarkedPriorities — UI affordance lets the user tag an event as
 *   "reporting upward". Until that tag ships, the rule cannot fire from
 *   title-only inference (too noisy).
 *
 * UNTIL DETECTOR LANDS: returns null.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

export function upwardReporting(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}
