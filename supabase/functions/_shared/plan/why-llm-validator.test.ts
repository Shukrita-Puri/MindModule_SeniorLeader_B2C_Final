// Validator-only tests — no LLM calls. Covers asymmetric grounding, narrowed
// valence gate, alias-based anchor matching, and same-event/same-arc dedupe.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateWhyLine,
  anchorTokens,
  tierToStateBand,
  arcPositionFromPhase,
  isTitleEcho,
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

Deno.test("validator — exact title echo is rejected before grounding", () => {
  const r = validateWhyLine({
    text: "Steady the system",
    stateBand: "steady" as StateBand,
    slotAnchor: anchorA,
    echoTexts: ["Steady the system", "Box Breathing"],
  });
  assertEquals(r, { ok: false, reason: "title_echo" });
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

Deno.test("isTitleEcho — normalises casing/whitespace and ignores blanks", () => {
  assertEquals(isTitleEcho("  Steady the system ", ["steady the system"]), true);
  assertEquals(isTitleEcho("Protect the board call", ["", null, undefined]), false);
});

// ────────────────────────────────────────────────────────────────────────
// Sprint 6 (Phase 8) — widened state synonyms, tightened valence, length cap
// ────────────────────────────────────────────────────────────────────────

Deno.test("validator — steady synonym 'calm' accepted (no anchor)", () => {
  const r = validateWhyLine({
    text: "The morning is calm before the back-to-backs begin.",
    stateBand: "steady" as StateBand,
    slotAnchor: { eventTitle: "", categoryId: null, phase: "pre" } as SlotAnchor,
  });
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validator — steady synonyms 'settled', 'on pace', 'in rhythm' accepted", () => {
  for (const text of [
    "You are settled heading in — hold the line before the next block.",
    "You are on pace for the afternoon; this keeps the tempo steady.",
    "You are in rhythm and this locks it in before the review.",
  ]) {
    const r = validateWhyLine({
      text,
      stateBand: "steady",
      slotAnchor: { eventTitle: "", categoryId: null, phase: "pre" } as SlotAnchor,
    });
    assert(r.ok, `expected accept for: ${text} → ${JSON.stringify(r)}`);
  }
});

Deno.test("validator — stretched/depleted synonyms accepted (thin, worn, heavy, foggy, fumes)", () => {
  for (const text of [
    "Energy is thin heading into the review — steady the system first.",
    "You are worn from the week; ground before the panel begins.",
    "The load is heavy today; clear the head before the next call.",
    "Focus is foggy right now — reset before the decision lands.",
    "You are running on fumes; protect the attention you have left.",
  ]) {
    const r = validateWhyLine({
      text,
      stateBand: "stretched",
      slotAnchor: { eventTitle: "", categoryId: null, phase: "pre" } as SlotAnchor,
    });
    assert(r.ok, `expected accept for: ${text} → ${JSON.stringify(r)}`);
  }
});

Deno.test("validator — firing/sharp synonyms accepted (dialed in, in flow, switched on)", () => {
  for (const text of [
    "You are dialed in — this holds the edge into the board meeting.",
    "You are in flow; this keeps the attention where it needs to be.",
    "You are switched on; this sustains the sharpness through the pitch.",
  ]) {
    const r = validateWhyLine({
      text,
      stateBand: "sharp",
      slotAnchor: { eventTitle: "", categoryId: null, phase: "pre" } as SlotAnchor,
    });
    assert(r.ok, `expected accept for: ${text} → ${JSON.stringify(r)}`);
  }
});

Deno.test("validator — overlong (>35 words) rejected as 'too_long'", () => {
  const longLine = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const r = validateWhyLine({
    text: longLine,
    stateBand: "steady",
    slotAnchor: anchorA,
  });
  assertEquals(r, { ok: false, reason: "too_long" });
});

Deno.test("validator — firing rejects 'unwind', 'ease off', 'ramp down'", () => {
  for (const text of [
    "You are sharp — unwind before the board meeting starts.",
    "You are sharp — ease off the pace before the board meeting.",
    "You are sharp — ramp down before the board meeting begins.",
  ]) {
    const r = validateWhyLine({
      text,
      stateBand: "firing",
      slotAnchor: anchorA,
    });
    assertEquals(r, { ok: false, reason: "valence_firing_recovery" });
  }
});

Deno.test("validator — depleted rejects 'power through' and 'dig in'", () => {
  for (const text of [
    "You are running low — power through the board meeting anyway.",
    "You are running low — dig in and get the board meeting done.",
  ]) {
    const r = validateWhyLine({
      text,
      stateBand: "depleted",
      slotAnchor: anchorA,
    });
    assertEquals(r, { ok: false, reason: "valence_depleted_push" });
  }
});

Deno.test("validator — same-event dedupe threshold unchanged (0.85 gate still holds)", () => {
  // Distinct-enough second line for same event/arc should still pass.
  const first = "Before the board meeting, this sharpens the decision you need to make.";
  const second = "Before the board meeting, this grounds you so the room reads calm.";
  const r = validateWhyLine({
    text: second,
    stateBand: "sharp",
    slotAnchor: anchorA,
    arcPosition: "prepare",
    priorAccepted: [{ text: first, slotAnchor: anchorA, arcPosition: "prepare" }],
  });
  assert(r.ok, JSON.stringify(r));
});

// ────────────────────────────────────────────────────────────────────────
// Sprint 7 pre-check — Sprint 6 word-count ceiling boundary confirmation
// (MAX_WHY_LINE_WORDS = 35 → exactly 35 accepted, 36+ rejected).
// ────────────────────────────────────────────────────────────────────────

Deno.test("validator — 35 words with grounding accepted (boundary at ceiling)", () => {
  // Exactly 35 words, includes a steady state token so grounding passes.
  const words = ["The", "morning", "is", "calm", "before", "the", "review"];
  while (words.length < 35) words.push("hold");
  const text = words.join(" ");
  const r = validateWhyLine({
    text,
    stateBand: "steady" as StateBand,
    slotAnchor: anchorA,
  });
  assert(r.ok, `expected accept at exactly 35 words → ${JSON.stringify(r)}`);
});

Deno.test("validator — 36 words rejected as too_long (one past ceiling)", () => {
  const words = ["The", "morning", "is", "calm", "before", "the", "review"];
  while (words.length < 36) words.push("hold");
  const text = words.join(" ");
  const r = validateWhyLine({
    text,
    stateBand: "steady" as StateBand,
    slotAnchor: anchorA,
  });
  assertEquals(r, { ok: false, reason: "too_long" });
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
