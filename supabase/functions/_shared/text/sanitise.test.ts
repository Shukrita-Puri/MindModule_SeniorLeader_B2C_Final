import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripBriefMarkdown, relativeEventPhrase, bucketForLocalHour } from "./sanitise.ts";

Deno.test("stripBriefMarkdown — removes stray *single asterisk* emphasis", () => {
  assertEquals(
    stripBriefMarkdown("With *Board Meeting * still ahead and reserves low."),
    "With Board Meeting still ahead and reserves low.",
  );
});

Deno.test("stripBriefMarkdown — collapses **double asterisks** to inner text", () => {
  assertEquals(
    stripBriefMarkdown("Protect **Executive Presence** today."),
    "Protect Executive Presence today.",
  );
});

Deno.test("stripBriefMarkdown — strips underscores + dangling asterisks", () => {
  assertEquals(
    stripBriefMarkdown("_Heads up_: ** noise ** ahead *"),
    "Heads up: noise ahead",
  );
});

Deno.test("stripBriefMarkdown — leaves clean text untouched", () => {
  const s = "Your readiness has recovered since your earlier check-in.";
  assertEquals(stripBriefMarkdown(s), s);
});

Deno.test("bucketForLocalHour — buckets cover full 24h", () => {
  assertEquals(bucketForLocalHour(0), "early-hours");
  assertEquals(bucketForLocalHour(4), "early-hours");
  assertEquals(bucketForLocalHour(5), "morning");
  assertEquals(bucketForLocalHour(11), "morning");
  assertEquals(bucketForLocalHour(12), "afternoon");
  assertEquals(bucketForLocalHour(17), "afternoon");
  assertEquals(bucketForLocalHour(18), "evening");
  assertEquals(bucketForLocalHour(23), "evening");
});

Deno.test("relativeEventPhrase — early-hours viewer + same-day morning event", () => {
  // Local 00:12 → event at 09:00 same day → "in the morning (≈9h away)".
  const now = Date.UTC(2026, 5, 4, 0, 12); // local matches UTC when offset = 0
  const start = Date.UTC(2026, 5, 4, 9, 0);
  const out = relativeEventPhrase({ startMs: start, nowMs: now, timezoneOffsetMinutes: 0 });
  assert(out.includes("morning"), `got: ${out}`);
  assert(out.includes("9h"), `got: ${out}`);
});

Deno.test("relativeEventPhrase — afternoon viewer + tomorrow morning event", () => {
  const now = Date.UTC(2026, 5, 4, 14, 0);
  const start = Date.UTC(2026, 5, 5, 9, 0);
  const out = relativeEventPhrase({ startMs: start, nowMs: now, timezoneOffsetMinutes: 0 });
  assertEquals(out, "tomorrow morning");
});

Deno.test("relativeEventPhrase — same-day, same-bucket event", () => {
  const now = Date.UTC(2026, 5, 4, 9, 0);
  const start = Date.UTC(2026, 5, 4, 11, 0);
  const out = relativeEventPhrase({ startMs: start, nowMs: now, timezoneOffsetMinutes: 0 });
  assertEquals(out, "later this morning");
});