// Validator-only tests — no LLM calls. Covers asymmetric grounding, narrowed
// valence gate, alias-based anchor matching, and same-event/same-arc dedupe.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateWhyLine,
  anchorTokens,
  tierToStateBand,
  arcPositionFromPhase,
  type StateBand,
} from "./why-llm.ts";
import type { SlotAnchor } from "./title-prefixes.ts";

const anchorA: SlotAnchor = { eventTitle: "Q2 Board Meeting", categoryId: "A", phase: "pre" };
const anchor11: SlotAnchor = { eventTitle: "1:1 with Sarah", categoryId: "D", phase: "pre" };

Deno.test("validator — band=null + anchor token present → accept (band gate skipped)", () => {
  const r = validateWhyLine({
    text: "Before the board meeting, this sharpens the decision call you need to make.",
    stateBand: null,
    slotAnchor: anchorA,
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — band=null + no anchor token + no state token → reject 'generic'", () => {
  const r = validateWhyLine({
    text: "This practice helps you stay productive throughout the workday.",
    stateBand: null,
    slotAnchor: anchorA,
  });
  assertEquals(r, { ok: false, reason: "generic" });
});

Deno.test("validator — firing + 'recover' verb → reject 'valence_firing_recovery'", () => {
  const r = validateWhyLine({
    text: "This clears your head and lets you recover before the board meeting lands.",
    stateBand: "firing" as StateBand,
    slotAnchor: anchorA,
  });
  assertEquals(r, { ok: false, reason: "valence_firing_recovery" });
});

Deno.test("validator — firing + 'protects' is ALLOWED (narrowed gate)", () => {
  const r = validateWhyLine({
    text: "This protects the attention you'll need for the board meeting in two hours.",
    stateBand: "firing" as StateBand,
    slotAnchor: anchorA,
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — depleted + 'push' verb → reject 'valence_depleted_push'", () => {
  const r = validateWhyLine({
    text: "Push the afternoon block hard so the board meeting doesn't catch you flat.",
    stateBand: "depleted" as StateBand,
    slotAnchor: anchorA,
  });
  assertEquals(r, { ok: false, reason: "valence_depleted_push" });
});

Deno.test("validator — depleted + 'running low' + anchor → accept", () => {
  const r = validateWhyLine({
    text: "You're running low and the board's at 2 — this clears your head before it matters.",
    stateBand: "depleted" as StateBand,
    slotAnchor: anchorA,
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — '1:1 with Sarah' anchored, body uses 'conversation' → accept via alias", () => {
  const r = validateWhyLine({
    text: "Before your conversation with Sarah, this is how you arrive grounded for the feedback.",
    stateBand: "steady" as StateBand,
    slotAnchor: anchor11,
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — same event + same arc, jaccard > 0.85 → reject 'jaccard_dup'", () => {
  const first = "Before the board meeting, this sharpens the decision you need to make.";
  const second = "Before the board meeting, this sharpens the decision you need to make today.";
  const r = validateWhyLine({
    text: second,
    stateBand: "sharp" as StateBand,
    slotAnchor: anchorA,
    arcPosition: "prepare",
    priorAccepted: [{ text: first, slotAnchor: anchorA, arcPosition: "prepare" }],
  });
  assertEquals(r, { ok: false, reason: "jaccard_dup" });
});

Deno.test("validator — same-day duplicate line → reject 'jaccard_dup'", () => {
  const r = validateWhyLine({
    text: "Before the board meeting, this sharpens the decision you need to make.",
    stateBand: "sharp" as StateBand,
    slotAnchor: anchorA,
    sameDayAccepted: [
      { text: "Before the board meeting, this sharpens the decision you need to make today." },
    ],
  });
  assertEquals(r, { ok: false, reason: "jaccard_dup" });
});

Deno.test("validator — same wording but different events → both accepted (dedupe NOT triggered)", () => {
  const anchorB: SlotAnchor = { eventTitle: "Client Pitch", categoryId: "B", phase: "pre" };
  const first = "Before the board meeting, this sharpens the decision you need to make.";
  const second = "Before the client pitch, this sharpens the decision you need to make.";
  const r = validateWhyLine({
    text: second,
    stateBand: "sharp" as StateBand,
    slotAnchor: anchorB,
    arcPosition: "prepare",
    priorAccepted: [{ text: first, slotAnchor: anchorA, arcPosition: "prepare" }],
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — empty text → reject 'empty'", () => {
  assertEquals(
    validateWhyLine({ text: "", stateBand: "sharp", slotAnchor: anchorA }),
    { ok: false, reason: "empty" },
  );
  assertEquals(
    validateWhyLine({ text: "   ", stateBand: null, slotAnchor: null }),
    { ok: false, reason: "empty" },
  );
});

Deno.test("tierToStateBand — canonical mappings", () => {
  assertEquals(tierToStateBand("peak"), "firing");
  assertEquals(tierToStateBand("strong"), "sharp");
  assertEquals(tierToStateBand("managing"), "steady");
  assertEquals(tierToStateBand("depleted"), "depleted");
  assertEquals(tierToStateBand("unknown_tier"), null);
  assertEquals(tierToStateBand(null), null);
  assertEquals(tierToStateBand("firing"), "firing"); // forward-compat
});

Deno.test("arcPositionFromPhase — pre/during/post + unknown → standalone", () => {
  assertEquals(arcPositionFromPhase("pre"), "prepare");
  assertEquals(arcPositionFromPhase("during"), "during");
  assertEquals(arcPositionFromPhase("post"), "recover");
  assertEquals(arcPositionFromPhase(null), "standalone");
  assertEquals(arcPositionFromPhase(undefined), "standalone");
  // Defensive: future jitPhase values map to standalone, never crash.
  // deno-lint-ignore no-explicit-any
  assertEquals(arcPositionFromPhase("future-phase" as any), "standalone");
});

Deno.test("anchorTokens — '1:1 with Sarah' keeps '1:1' compound + folds D aliases", () => {
  const toks = anchorTokens("1:1 with Sarah", "D");
  assert(toks.has("1:1"), "expected '1:1' compound token preserved");
  assert(toks.has("sarah"));
  assert(toks.has("conversation"), "expected D-category alias 'conversation'");
});
