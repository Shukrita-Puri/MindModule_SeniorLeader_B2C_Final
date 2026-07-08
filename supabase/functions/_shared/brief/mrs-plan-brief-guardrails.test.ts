// Sprint 8 / Phase 10 — MRS / Brief / Plan guardrail regression tests.
//
// Locks the Executive Home "no fake cards" contract now that Plan and
// Brief fallbacks exist. These tests are intentionally scoped to pure
// predicates so they do not depend on network/DB. The gating booleans
// exercised here mirror the inline logic in:
//   - supabase/functions/compute-inner-readiness/index.ts   (MRS awaiting)
//   - supabase/functions/compute-outer-readiness/index.ts   (Brief gating)
//   - supabase/functions/generate-mastery-plan/index.ts     (Plan gating)
//
// If any of these predicates diverge from the runtime code, the runtime
// code is the bug — the guardrail here encodes the shipped contract:
//   Calendar-only MUST NOT unlock MRS, Brief, or Plan.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideBriefFallback,
  DETERMINISTIC_BODY_RUNAWAY_WORDS,
} from "./deterministic-fallback.ts";

// ---------- pure mirrors of the runtime gates ----------

interface SignalCtx {
  hasWearableData: boolean;
  hasCalendarSignal: boolean;
  hasCalendarConnected: boolean;
  mrsCardsAwaiting: boolean;
}

/** Mirrors generate-mastery-plan/index.ts `canGeneratePlan`. */
function canGeneratePlan(c: SignalCtx): boolean {
  const hasStage1Signal = c.hasWearableData || c.hasCalendarSignal || c.hasCalendarConnected;
  return hasStage1Signal && !c.mrsCardsAwaiting;
}

/** Mirrors compute-inner-readiness: MRS requires a usable wearable pillar. */
function mrsIsAwaiting(c: { hasWearableBaseline: boolean }): boolean {
  return !c.hasWearableBaseline;
}

// ---------- MRS guardrails ----------

Deno.test("MRS guardrail — calendar-only + no wearable → MRS awaiting", () => {
  assert(mrsIsAwaiting({ hasWearableBaseline: false }));
});

Deno.test("MRS guardrail — wearable baseline present → MRS not awaiting", () => {
  assertEquals(mrsIsAwaiting({ hasWearableBaseline: true }), false);
});

// ---------- Plan guardrails ----------

Deno.test("Plan guardrail — calendar-only + MRS awaiting → Plan cannot generate", () => {
  assertEquals(
    canGeneratePlan({
      hasWearableData: false,
      hasCalendarSignal: true,
      hasCalendarConnected: true,
      mrsCardsAwaiting: true,
    }),
    false,
  );
});

Deno.test("Plan guardrail — calendar-connected only + MRS awaiting → Plan cannot generate", () => {
  assertEquals(
    canGeneratePlan({
      hasWearableData: false,
      hasCalendarSignal: false,
      hasCalendarConnected: true,
      mrsCardsAwaiting: true,
    }),
    false,
  );
});

Deno.test("Plan guardrail — wearable-only + MRS ready → Plan can generate (baseline)", () => {
  assert(
    canGeneratePlan({
      hasWearableData: true,
      hasCalendarSignal: false,
      hasCalendarConnected: false,
      mrsCardsAwaiting: false,
    }),
  );
});

Deno.test("Plan guardrail — wearable + calendar + MRS ready → Plan can generate (refined)", () => {
  assert(
    canGeneratePlan({
      hasWearableData: true,
      hasCalendarSignal: true,
      hasCalendarConnected: true,
      mrsCardsAwaiting: false,
    }),
  );
});

Deno.test("Plan guardrail — no signal at all → Plan cannot generate", () => {
  assertEquals(
    canGeneratePlan({
      hasWearableData: false,
      hasCalendarSignal: false,
      hasCalendarConnected: false,
      mrsCardsAwaiting: true,
    }),
    false,
  );
});

Deno.test("Plan guardrail — hasStage1Signal alone is INSUFFICIENT (contract)", () => {
  // This test exists to fail loudly if a future refactor drops the
  // `!mrsCardsAwaiting` half of the gate.
  const stage1Only = { hasWearableData: false, hasCalendarSignal: true, hasCalendarConnected: true };
  assertEquals(canGeneratePlan({ ...stage1Only, mrsCardsAwaiting: true }), false);
  assertEquals(canGeneratePlan({ ...stage1Only, mrsCardsAwaiting: false }), true);
});

// ---------- Brief guardrails (cross-function contract) ----------

const READY_PHRASE = "Steady the system.";
const READY_BODY =
  "Two high-stakes moments ahead and your body is running elevated; settle before the first call so the room reads calm.";

Deno.test("Brief guardrail — calendar-only + MRS awaiting + LLM miss → Brief stays awaiting", () => {
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: false,
    innerStateIsAwaiting: true, // MRS awaiting propagates here
    deterministicPhrase: READY_PHRASE,
    deterministicBody: READY_BODY,
  });
  assertEquals(d, { use: false, reason: "inner_state_awaiting" });
});

Deno.test("Brief guardrail — cold-start signals + LLM miss → Brief stays awaiting", () => {
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: true,
    innerStateIsAwaiting: false,
    deterministicPhrase: READY_PHRASE,
    deterministicBody: READY_BODY,
  });
  assertEquals(d, { use: false, reason: "awaiting_signals" });
});

Deno.test("Brief guardrail — signals ready + LLM miss → deterministic acceptable", () => {
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: false,
    innerStateIsAwaiting: false,
    deterministicPhrase: READY_PHRASE,
    deterministicBody: READY_BODY,
  });
  assertEquals(d.use, true);
});

Deno.test("Brief guardrail — 80-word deterministic body still accepted (Sprint 8 relaxation)", () => {
  const body = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: false,
    innerStateIsAwaiting: false,
    deterministicPhrase: READY_PHRASE,
    deterministicBody: body,
  });
  assertEquals(d.use, true);
});

Deno.test("Brief guardrail — runaway (>120 words) deterministic body rejected", () => {
  const body = Array.from({ length: DETERMINISTIC_BODY_RUNAWAY_WORDS + 5 }, (_, i) => `word${i}`).join(" ");
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: false,
    innerStateIsAwaiting: false,
    deterministicPhrase: READY_PHRASE,
    deterministicBody: body,
  });
  assertEquals(d, { use: false, reason: "deterministic_copy_invalid" });
});

// ---------- Check-in cannot fabricate wearable pillar ----------

Deno.test("Check-in-only guardrail — check-in without wearable baseline does not unlock MRS", () => {
  // A subjective check-in alone must not synthesize a wearable baseline.
  // The MRS pillar remains awaiting; therefore the Plan gate must stay closed.
  const checkInOnly: SignalCtx = {
    hasWearableData: false,
    hasCalendarSignal: false,
    hasCalendarConnected: false,
    mrsCardsAwaiting: mrsIsAwaiting({ hasWearableBaseline: false }),
  };
  assertEquals(canGeneratePlan(checkInOnly), false);
});