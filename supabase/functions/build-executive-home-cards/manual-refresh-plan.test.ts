/**
 * Source-level guardrails for the manual_refresh Plan contract.
 *
 * The orchestrator is too heavy to spin up in-process (DB + edge chain), so
 * we assert the in-code invariants that define the required behavior:
 *
 *   1. Manual refresh forces Plan regeneration even when stage-one signal
 *      is missing — the skip branch is gated by `shouldForcePlanOnManualRefresh`.
 *   2. planStatus is derived from the returned payload (renderable vs
 *      awaiting) and not hard-coded to "ready" after HTTP 200.
 *   3. A structured `[manual-refresh-plan]` log fires with `forced: true`.
 *   4. A `[plan-summary]` log fires with the derived planStatus.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("manual_refresh bypasses stage-one Plan skip", () => {
  assertStringIncludes(SRC, 'const shouldForcePlanOnManualRefresh = mode === "manual_refresh"');
  assertStringIncludes(SRC, "if (!hasStageOneSignal && !shouldForcePlanOnManualRefresh)");
});

Deno.test("planStatus is derived from Plan payload, not HTTP success", () => {
  // No unconditional `planStatus = "ready"` after the invoke.
  const readyAssignments = SRC.split('planStatus = "ready"').length - 1;
  // Should appear at most once, inside a conditional (hasRenderable ? "ready" : ...).
  assert(readyAssignments <= 1, `planStatus="ready" should be conditional, found ${readyAssignments}`);
  assertStringIncludes(SRC, 'hasRenderable ? "ready"');
  assertStringIncludes(SRC, 'awaitingSignals');
  assertStringIncludes(SRC, 'planState === "awaiting_signals"');
});

Deno.test("manual-refresh-plan log fires with forced: true", () => {
  assertStringIncludes(SRC, "[build-executive-home-cards][manual-refresh-plan]");
  assertStringIncludes(SRC, "forced: true,");
  assertStringIncludes(SRC, "skippedStageOneGate,");
});

Deno.test("plan-summary log fires with derivedPlanStatus", () => {
  assertStringIncludes(SRC, "[build-executive-home-cards][plan-summary]");
  assertStringIncludes(SRC, "derivedPlanStatus: planStatus,");
});

Deno.test("Plan errors are caught and mapped to planStatus='error'", () => {
  assertStringIncludes(SRC, 'planStatus = "error"');
  assertStringIncludes(SRC, "catch (planErr)");
});
