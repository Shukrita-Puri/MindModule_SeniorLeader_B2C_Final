/**
 * CLUSTER: Empty-slot protection (STUB — Batch 3)
 * SOURCE: user spec — when the calendar shows a real gap (≥90min) inside the
 * work day, protect it rather than fill it. The system's failure mode is to
 * see an empty block as "free capacity for an extra practice" — the user
 * already paid the cost of that block being empty (focus work, recovery,
 * thinking time).
 *
 * APPLICATION (when detector lands):
 * - BRIEF: name the block as "protected" not "available".
 * - PLAN:  do NOT slot a practice into the gap; suppress JIT promotions inside it.
 * - NUDGE: silent inside the block; only fire 5-10min before it ends if next
 *          event is high-stakes (handoff cue, not interruption).
 *
 * RULES: emptySlotProtection
 *
 * SIGNALS REQUIRED:
 *   hasUpcomingEmptyBlock detector — gap ≥ 90min between events during work
 *   hours, not bookended by travel or PTO.
 *
 * UNTIL DETECTOR LANDS: returns null.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

export function emptySlotProtection(_ctx: RuleContext): BehaviourFlag | null {
  return null;
}
