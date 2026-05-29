// OWNERSHIP: engineering. Thin adapter between consumer edge functions
// (compute-outer-readiness, smart-nudges, generate-mastery-plan) and the
// shared deterministic behaviour layer.
//
// Phase 2 wiring. Gated behind SHARED_MODULES_ENABLED env flag — when the
// flag is off (default), every helper here is a no-op and consumers behave
// exactly as they did pre-wiring. When on, consumers get:
//   • flags     — sorted BehaviourFlag[] for the requested scope
//   • slotBoosts — SlotBoost[] (plan only; empty for brief/nudge scopes)
//   • promptBlock — pre-formatted advisory block to append to an LLM prompt
//
// Consumers MUST NOT import behaviour-evaluator or ceo-behaviour-rules
// directly — go through this adapter so the flag, error envelope, and
// prompt block format stay consistent across surfaces.

import type {
  BehaviourFlag,
  RuleContext,
  RuleScope,
  SlotBoost,
} from "./brief-context.ts";
import { deriveSlotBoosts, evaluate } from "./behaviour-evaluator.ts";
import {
  buildRuleContext,
  type SignalCoverageInput,
} from "./brief-signal-coverage.ts";

// Default ON: Brief, Plan, and Notifications must reason from the canonical
// CEO behaviour + event taxonomy modules. Set SHARED_MODULES_ENABLED=false
// in env to opt out for a single function (escape hatch only).
export const SHARED_MODULES_ENABLED =
  (Deno.env.get("SHARED_MODULES_ENABLED") ?? "true").toLowerCase() !== "false";

export interface BehaviourWiringResult {
  flags: BehaviourFlag[];
  slotBoosts: SlotBoost[];
  /** Empty string when no flags fired. Safe to concatenate unconditionally. */
  promptBlock: string;
}

export type RuleContextExtras = Partial<
  Pick<
    RuleContext,
    | "dayOfWeek"
    | "backToBackHoursToday"
    | "historicalAppOpenRateLow"
    | "conferenceDayNumber"
  >
>;

/**
 * Evaluate CEO behaviour rules for the given scope. Returns `null` when the
 * feature flag is off or evaluation fails — callers should treat null as
 * "do nothing, behave as before".
 */
export function evaluateForScope(
  input: SignalCoverageInput,
  scope: RuleScope,
  extras: RuleContextExtras = {},
): BehaviourWiringResult | null {
  if (!SHARED_MODULES_ENABLED) return null;
  try {
    const ctx = buildRuleContext(input, extras);
    const flags = evaluate(ctx, { scope });
    const slotBoosts = scope === "plan" ? deriveSlotBoosts(flags) : [];
    const promptBlock = formatPromptBlock(flags);
    console.log(
      `[behaviour-wiring] scope=${scope} flags=${flags.length} boosts=${slotBoosts.length} rules=${
        flags.map((f) => `${f.rule}:${f.severity}`).join(",") || "none"
      }`,
    );
    return { flags, slotBoosts, promptBlock };
  } catch (err) {
    console.error("[behaviour-wiring] evaluation failed:", err);
    return null;
  }
}

/**
 * Pre-formatted block to append to a system or user prompt. Empty string when
 * no flags fired so callers can `prompt += result.promptBlock` without guards.
 */
function formatPromptBlock(flags: BehaviourFlag[]): string {
  if (!flags.length) return "";
  const lines = flags.map((f) => {
    const anchor = f.anchorEvent ? ` @"${f.anchorEvent}"` : "";
    const stake = f.stake ? ` (${f.stake})` : "";
    const evidence = f.evidence.length ? ` — evidence: ${f.evidence.join(", ")}` : "";
    return `- ${f.rule} [${f.severity}]${anchor}${stake}: ${f.copyHint}${evidence}`;
  });
  return [
    "",
    "",
    "=== ACTIVE CEO BEHAVIOURS (deterministic; execute the copyHint, never echo verbatim) ===",
    ...lines,
  ].join("\n");
}

/**
 * Plan-only helper: apply slot boosts to a moduleMapping by bumping priority
 * for the matching practiceType when the boost slot matches the time-of-day.
 * No-op when the result is null (flag off) or boosts list is empty.
 */
export function applySlotBoostsToMapping<
  M extends Partial<
    Record<
      SlotBoost["practiceType"],
      { priority: number; [k: string]: unknown } | undefined
    >
  >,
>(
  mapping: M,
  boosts: SlotBoost[],
  timeOfDay: "morning" | "afternoon" | "evening",
  // priority bump per severity tier
  bump: Record<SlotBoost["severity"], number> = { high: 3, medium: 2, low: 1 },
): { mapping: M; applied: Array<{ practiceType: string; bump: number; reason: string }> } {
  const slotForTOD: Record<typeof timeOfDay, SlotBoost["slot"]> = {
    morning: "start_of_day",
    afternoon: "midday",
    evening: "end_of_day",
  };
  const targetSlot = slotForTOD[timeOfDay];
  const applied: Array<{ practiceType: string; bump: number; reason: string }> = [];
  for (const b of boosts) {
    if (b.slot !== targetSlot) continue;
    const slot = mapping[b.practiceType];
    if (!slot) continue;
    const delta = bump[b.severity];
    slot.priority = (slot.priority ?? 0) + delta;
    applied.push({ practiceType: b.practiceType, bump: delta, reason: b.reason });
  }
  return { mapping, applied };
}