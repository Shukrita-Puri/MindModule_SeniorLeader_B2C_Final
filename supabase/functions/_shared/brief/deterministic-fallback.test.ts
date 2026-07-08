// Sprint 7 / Phase 9A — Deterministic Brief fallback decision tests.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideBriefFallback,
  capDeterministicBody,
  DETERMINISTIC_BODY_MAX_WORDS,
} from "./deterministic-fallback.ts";

const READY_PHRASE = "Steady the system.";
const READY_BODY = "Two high-stakes moments ahead and your body is running elevated; " +
  "settle before the first call so the room reads calm.";

const READY_BASE = {
  cachedSnapshotPresent: false,
  llmBriefPresent: false,
  awaitingSignals: false,
  innerStateIsAwaiting: false,
  deterministicPhrase: READY_PHRASE,
  deterministicBody: READY_BODY,
};

Deno.test("fallback — LLM miss + ready signals → deterministic used", () => {
  const d = decideBriefFallback(READY_BASE);
  assertEquals(d, { use: true, reason: "llm_miss_signals_ready" });
});

Deno.test("fallback — cache hit wins over deterministic", () => {
  const d = decideBriefFallback({ ...READY_BASE, cachedSnapshotPresent: true });
  assertEquals(d, { use: false, reason: "cache_hit" });
});

Deno.test("fallback — LLM accepted wins over deterministic", () => {
  const d = decideBriefFallback({ ...READY_BASE, llmBriefPresent: true });
  assertEquals(d, { use: false, reason: "llm_accepted" });
});

Deno.test("fallback — awaitingSignals blocks deterministic (stays awaiting)", () => {
  const d = decideBriefFallback({ ...READY_BASE, awaitingSignals: true });
  assertEquals(d, { use: false, reason: "awaiting_signals" });
});

Deno.test("fallback — innerStateIsAwaiting blocks deterministic (stays awaiting)", () => {
  const d = decideBriefFallback({ ...READY_BASE, innerStateIsAwaiting: true });
  assertEquals(d, { use: false, reason: "inner_state_awaiting" });
});

Deno.test("fallback — missing deterministic phrase → stays awaiting", () => {
  const d = decideBriefFallback({ ...READY_BASE, deterministicPhrase: "" });
  assertEquals(d, { use: false, reason: "deterministic_copy_missing" });
});

Deno.test("fallback — missing deterministic body → stays awaiting", () => {
  const d = decideBriefFallback({ ...READY_BASE, deterministicBody: "  " });
  assertEquals(d, { use: false, reason: "deterministic_copy_missing" });
});

Deno.test("fallback — banned wellness word in deterministic body → invalid", () => {
  const d = decideBriefFallback({
    ...READY_BASE,
    deterministicBody: "Take a mindful breath and recharge before the review.",
  });
  assertEquals(d, { use: false, reason: "deterministic_copy_invalid" });
});

Deno.test("fallback — extremely short body (<3 words) → invalid", () => {
  const d = decideBriefFallback({ ...READY_BASE, deterministicBody: "ok now" });
  assertEquals(d, { use: false, reason: "deterministic_copy_invalid" });
});

Deno.test("cap — body within ceiling is returned unchanged", () => {
  const out = capDeterministicBody(READY_BODY);
  assertEquals(out, READY_BODY.trim());
  assert(out.split(/\s+/).length <= DETERMINISTIC_BODY_MAX_WORDS);
});

Deno.test("cap — body beyond ceiling is truncated to max words", () => {
  const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
  const out = capDeterministicBody(long);
  assertEquals(out.split(/\s+/).length, DETERMINISTIC_BODY_MAX_WORDS);
  assert(out.endsWith("."), "expected trailing period after truncation");
});

Deno.test("fallback — includes signal-grounded body (event/state reference)", () => {
  // Precondition test: deterministic path only fires if the body carries
  // some grounding text. The composer output already does this; here we
  // assert the guard doesn't strip a valid grounded line.
  const grounded = "Board meeting is anchoring the day; settle the system before it lands.";
  const d = decideBriefFallback({ ...READY_BASE, deterministicBody: grounded });
  assertEquals(d.use, true);
});