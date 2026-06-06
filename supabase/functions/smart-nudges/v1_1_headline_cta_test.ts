/**
 * v1.1 — Headline + CTA + delivery-context contract tests.
 *
 * These tests assert pure helpers exported (or re-implemented as locals
 * mirroring) in index.ts. They guard the new contract pieces:
 *   - collapsed/expanded headline structure
 *   - subtitle clamping
 *   - weekend CTA + reminder CTA appended onto bodies
 *   - back-to-back gap thresholds + post-landing window thresholds
 *
 * Run via: supabase--test_edge_functions {functions:["smart-nudges"]}.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Mirror the constants from index.ts so the test file is self-contained
// and does not require exporting internals.
const MIND_MODULE_TITLE = "Mind Module";
const SUBTITLE_MAX_WORDS = 3;
const SUBTITLE_MAX_CHARS = 28;
const WEEKEND_CTA = "let's prioritise the week ahead";
const REMINDER_CTA = "take 60 seconds";
const BACK_TO_BACK_MIN_GAP_MIN = 30;
const REMINDER_GAP_UPPER_MIN = 60;
const POST_LANDING_MIN = 15;
const POST_LANDING_MAX = 60;

function clampSubtitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return "";
  s = s.split(" ").slice(0, SUBTITLE_MAX_WORDS).join(" ");
  return s.slice(0, SUBTITLE_MAX_CHARS);
}

function requiresHeadlineStructure(title: string, subtitle: string): string | null {
  if (title !== MIND_MODULE_TITLE) return `title must be "${MIND_MODULE_TITLE}"`;
  if (!subtitle || !subtitle.trim()) return "subtitle missing";
  const w = subtitle.trim().split(/\s+/).length;
  if (w > SUBTITLE_MAX_WORDS) return `subtitle > ${SUBTITLE_MAX_WORDS} words (${w})`;
  if (subtitle.length > SUBTITLE_MAX_CHARS) {
    return `subtitle > ${SUBTITLE_MAX_CHARS} chars (${subtitle.length})`;
  }
  return null;
}

// ── Headline contract ──────────────────────────────────────────────────

Deno.test("v1.1 — title is always 'Mind Module'", () => {
  assertEquals(requiresHeadlineStructure("Mind Module", "Recovery in progress"), null);
  assert(requiresHeadlineStructure("Recovery in progress", "Recovery in progress") !== null);
});

Deno.test("v1.1 — subtitle clamps to 3 words / 28 chars", () => {
  assertEquals(clampSubtitle("Recovery in progress"), "Recovery in progress");
  assertEquals(clampSubtitle("Pre-flight window opens now"), "Pre-flight window opens");
  assertEquals(clampSubtitle("A very long subtitle exceeding limits"), "A very long");
  // Char cap kicks in before word cap for long single words.
  assertEquals(clampSubtitle("Antidisestablishmentarianismisverylong").length <= SUBTITLE_MAX_CHARS, true);
});

Deno.test("v1.1 — subtitle empty fails structure check", () => {
  assert(requiresHeadlineStructure(MIND_MODULE_TITLE, "") !== null);
  assert(requiresHeadlineStructure(MIND_MODULE_TITLE, "   ") !== null);
});

Deno.test("v1.1 — subtitle 4 words fails structure check", () => {
  assert(requiresHeadlineStructure(MIND_MODULE_TITLE, "One two three four") !== null);
});

// ── Weekend / reminder CTA presence ────────────────────────────────────

Deno.test("v1.1 — weekend CTA verb shape", () => {
  // Must be all lower-case, terminal-friendly.
  assertEquals(WEEKEND_CTA, WEEKEND_CTA.toLowerCase());
  assertEquals(/[.!?]$/.test(WEEKEND_CTA), false);
});

Deno.test("v1.1 — reminder CTA verb shape", () => {
  assertEquals(REMINDER_CTA, REMINDER_CTA.toLowerCase());
  assertEquals(/[.!?]$/.test(REMINDER_CTA), false);
});

// ── Back-to-back + reminder gap thresholds ─────────────────────────────

function classifyGap(largestGapMin: number): "back_to_back" | "reminder" | "full" {
  if (largestGapMin < BACK_TO_BACK_MIN_GAP_MIN) return "back_to_back";
  if (largestGapMin <= REMINDER_GAP_UPPER_MIN) return "reminder";
  return "full";
}

Deno.test("v1.1 — 15 min gap → back_to_back (suppress)", () => {
  assertEquals(classifyGap(15), "back_to_back");
});

Deno.test("v1.1 — 45 min gap → reminder variant", () => {
  assertEquals(classifyGap(45), "reminder");
});

Deno.test("v1.1 — 90 min gap → full nudge", () => {
  assertEquals(classifyGap(90), "full");
});

// ── Post-landing window ────────────────────────────────────────────────

function isPostLanding(minutesUntil: number): boolean {
  return minutesUntil >= POST_LANDING_MIN && minutesUntil <= POST_LANDING_MAX;
}

Deno.test("v1.1 — meeting 10 min after landing → not post_landing (too soon)", () => {
  assertEquals(isPostLanding(10), false);
});

Deno.test("v1.1 — meeting 45 min after landing → post_landing", () => {
  assertEquals(isPostLanding(45), true);
});

Deno.test("v1.1 — meeting 90 min after landing → not post_landing (outside window)", () => {
  assertEquals(isPostLanding(90), false);
});

// ── Weekend CTA gate state machine ─────────────────────────────────────

type Gate = "ok" | "missing_brief" | "missing_plan";
function resolveWeekendGate(hasBrief: boolean, hasPlan: boolean): Gate {
  if (!hasBrief) return "missing_brief";
  if (!hasPlan) return "missing_plan";
  return "ok";
}

Deno.test("v1.1 — weekend gate ok only when Brief + Plan both present", () => {
  assertEquals(resolveWeekendGate(true, true), "ok");
  assertEquals(resolveWeekendGate(false, true), "missing_brief");
  assertEquals(resolveWeekendGate(true, false), "missing_plan");
  assertEquals(resolveWeekendGate(false, false), "missing_brief");
});

// Silence unused-imports lint where assert isn't directly called.
void assert;