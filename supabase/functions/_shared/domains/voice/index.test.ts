// [KIND: test] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 5 Voice Contract Domain (VOC).
// Tests: Golden examples, banned words, allowances, length bounds, safety & privacy, claim set.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildBriefClaimSet,
  buildPromptBlocks,
  validateCopy,
} from "./index.ts";
import type { SurfaceContract, WriteRequest } from "./types.ts";

Deno.test("Voice: Golden Chief of Staff nudge passes validation", () => {
  const text = "Board at 2. Arrive settled. Your HRV is 18% below usual, and your heart rate rose before your last three boards.";
  const contract: SurfaceContract = {
    surface: "nudge",
  };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, true);
  assertEquals(result.violations.length, 0);
  assertEquals(result.wordCount <= 22, true);
});

Deno.test("Voice: Wellness clichés fail validation", () => {
  const text = "Take time to relax and recharge with a mindful pause.";
  const contract: SurfaceContract = {
    surface: "nudge",
  };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, false);
  const codes = result.violations.map((v) => v.code);
  assertEquals(codes.includes("banned_wellness_word"), true);
});

Deno.test("Voice: Surface allowance permits 'breathe' in Recalibrate practice register", () => {
  const text = "Breathe in for four seconds and steady your posture.";
  const recalibrateContract: SurfaceContract = {
    surface: "recalibrate",
    allowPracticePhrases: true,
  };

  const nudgeContract: SurfaceContract = {
    surface: "nudge",
    allowPracticePhrases: false,
  };

  const recalibrateResult = validateCopy(text, recalibrateContract);
  assertEquals(recalibrateResult.valid, true);

  const nudgeResult = validateCopy(text, nudgeContract);
  assertEquals(nudgeResult.valid, false);
  assertEquals(nudgeResult.violations.some((v) => v.offendingText === "breathe"), true);
});

Deno.test("Voice: Metric tokens (HRV, resting heart rate) are allowed per D-L5-4", () => {
  const text = "Before your 2pm. Your HRV is 18% below your usual.";
  const contract: SurfaceContract = {
    surface: "nudge",
  };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, true);
});

Deno.test("Voice: Baseline wording fails (say 'your usual' instead)", () => {
  const text = "Your HRV is 18% below baseline.";
  const contract: SurfaceContract = {
    surface: "nudge",
  };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, false);
  assertEquals(result.violations.some((v) => v.code === "banned_baseline_word"), true);
});

Deno.test("Voice: Praise and cheerleading words fail validation", () => {
  const text = "Great job crushing it today, keep up the amazing streak!";
  const contract: SurfaceContract = {
    surface: "nudge",
  };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, false);
  assertEquals(result.violations.some((v) => v.code === "banned_praise_phrase"), true);
});

Deno.test("Voice: Length bounds enforced on MRS and Dense Nudges", () => {
  const longMrs = "This is a very long MRS one line explanation that clearly exceeds twelve total words in the sentence.";
  const mrsContract: SurfaceContract = { surface: "mrs" };

  const mrsResult = validateCopy(longMrs, mrsContract);
  assertEquals(mrsResult.valid, false);
  assertEquals(mrsResult.violations.some((v) => v.code === "word_count_too_high"), true);

  const denseNudge = "Four hours straight and your heart rate has not settled since lunch. Reset now.";
  const denseContract: SurfaceContract = { surface: "nudge", isDenseDay: true };

  const denseResult = validateCopy(denseNudge, denseContract);
  assertEquals(denseResult.valid, false);
  assertEquals(denseResult.violations.some((v) => v.code === "word_count_too_high"), true);
});

Deno.test("Voice: Safety & Privacy - Emotion labeling from physiology fails", () => {
  const text = "You're anxious about the board meeting.";
  const contract: SurfaceContract = { surface: "nudge" };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, false);
  assertEquals(result.violations.some((v) => v.code === "banned_emotion_inference"), true);
});

Deno.test("Voice: Safety & Privacy - Sensitive meeting type in nudge fails (time-only required)", () => {
  const text = "Before your performance review with the chair.";
  const contract: SurfaceContract = { surface: "nudge" };

  const result = validateCopy(text, contract);
  assertEquals(result.valid, false);
  assertEquals(result.violations.some((v) => v.code === "sensitive_meeting_named"), true);
});

Deno.test("Voice: Claim set prevents duplicating already stated claims", () => {
  const briefText = "Short night after three heavy days. HRV is 18% below your usual.";
  const claimSet = buildBriefClaimSet(briefText);

  const planWhy = "Short night after three heavy days and high stakes.";
  const contract: SurfaceContract = { surface: "plan_why", checkClaimSet: true };

  const result = validateCopy(planWhy, contract, claimSet);
  assertEquals(result.valid, false);
  assertEquals(result.violations.some((v) => v.code === "duplicate_claim"), true);
});

Deno.test("Voice: Hygiene sanitizes curly quotes and removes emojis", () => {
  const text = "“Board at 2.” 🔥 Settle first.";
  const contract: SurfaceContract = { surface: "nudge" };

  const result = validateCopy(text, contract);
  assertEquals(result.sanitizedText.includes("“"), false);
  assertEquals(result.sanitizedText.includes('"'), true);
  assertEquals(result.sanitizedText.includes("🔥"), false);
});

Deno.test("Voice: Prompt block assembly includes persona, contract, and evidence", () => {
  const request: WriteRequest = {
    surface: "nudge",
    stance: "caution",
    evidence: [
      { kind: "observed", fact: "hrv_vs_usual", value: -18, unit: "pct" },
    ],
    leaderVoice: {
      what_lands: ["direct", "evidence first"],
    },
  };

  const prompt = buildPromptBlocks(request);
  assertEquals(prompt.includes("CHIEF OF STAFF FOR THE MIND"), true);
  assertEquals(prompt.includes("SURFACE CONTRACT: NUDGE"), true);
  assertEquals(prompt.includes("hrv_vs_usual"), true);
  assertEquals(prompt.includes("LEADER PREFERENCES"), true);
});
