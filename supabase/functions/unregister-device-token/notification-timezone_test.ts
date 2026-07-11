/**
 * Batch B follow-up — behavioural tests for the timezone helpers that
 * every notification decision now depends on. These are runtime tests
 * (not source-string asserts).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  eventHourInTimezone,
  localDayBoundsUtc,
  isHourInDndWindow,
  localParts,
} from "../_shared/effective-timezone.ts";

// ── Asia/Kolkata local day differs from UTC ────────────────────────
Deno.test("Asia/Kolkata: local day is +1 vs UTC just after 18:30 UTC", () => {
  // 2026-07-11T19:00:00Z is 2026-07-12T00:30:00 IST (UTC+5:30)
  const parts = localParts("Asia/Kolkata", new Date("2026-07-11T19:00:00Z"));
  assertEquals(parts.localDate, "2026-07-12");
  assertEquals(parts.hour, 0);
});

// ── Europe/London DST transitions ──────────────────────────────────
Deno.test("Europe/London: BST (summer) offset is 60 min after last-Sun of March", () => {
  // 2026-03-30T10:00:00Z is 11:00 local (BST, +01:00)
  const parts = localParts("Europe/London", new Date("2026-03-30T10:00:00Z"));
  assertEquals(parts.hour, 11);
});

Deno.test("Europe/London: GMT offset returns to 0 after last-Sun of October", () => {
  // 2026-11-01T10:00:00Z is 10:00 local (GMT, +00:00)
  const parts = localParts("Europe/London", new Date("2026-11-01T10:00:00Z"));
  assertEquals(parts.hour, 10);
});

// ── America/New_York DST ───────────────────────────────────────────
Deno.test("America/New_York: EDT (-04:00) in July", () => {
  const parts = localParts("America/New_York", new Date("2026-07-11T18:00:00Z"));
  assertEquals(parts.hour, 14); // 14:00 EDT
});

Deno.test("America/New_York: EST (-05:00) in January", () => {
  const parts = localParts("America/New_York", new Date("2026-01-11T18:00:00Z"));
  assertEquals(parts.hour, 13); // 13:00 EST
});

// ── Events near local midnight ─────────────────────────────────────
Deno.test("event at 23:55 local classifies as evening in New_York", () => {
  // 2026-07-11T23:55 EDT == 2026-07-12T03:55Z
  const hour = eventHourInTimezone(new Date("2026-07-12T03:55:00Z"), "America/New_York");
  assert(hour >= 23 && hour < 24, `expected 23.xx, got ${hour}`);
});

Deno.test("event at 00:05 local classifies as morning in Kolkata", () => {
  // 00:05 IST == 18:35Z the previous day
  const hour = eventHourInTimezone(new Date("2026-07-10T18:35:00Z"), "Asia/Kolkata");
  assert(hour >= 0 && hour < 1, `expected 0.xx, got ${hour}`);
});

Deno.test("event on a different UTC date is bucketed on the LOCAL date", () => {
  // UTC 2026-07-12T02:00Z is 2026-07-12T07:30 IST (local morning) but
  // 2026-07-11T22:00 EDT (local evening).
  const b = localDayBoundsUtc("2026-07-12", "Asia/Kolkata");
  const evt = "2026-07-12T02:00:00.000Z";
  assert(evt >= b.startUtc && evt < b.endUtc, "IST 2026-07-12 should include 02:00Z");
  const bNY = localDayBoundsUtc("2026-07-11", "America/New_York");
  assert(evt >= bNY.startUtc && evt < bNY.endUtc, "NY 2026-07-11 should include 02:00Z");
});

// ── local-day UTC bounds ───────────────────────────────────────────
Deno.test("localDayBoundsUtc: Asia/Kolkata 2026-07-11", () => {
  const b = localDayBoundsUtc("2026-07-11", "Asia/Kolkata");
  assertEquals(b.startUtc, "2026-07-10T18:30:00.000Z");
  assertEquals(b.endUtc,   "2026-07-11T18:30:00.000Z");
});

Deno.test("localDayBoundsUtc: America/New_York DST spring-forward day (2026-03-08)", () => {
  const b = localDayBoundsUtc("2026-03-08", "America/New_York");
  // 00:00 EST on 2026-03-08 = 05:00Z. Next local midnight is 00:00 EDT
  // on 2026-03-09 = 04:00Z (23-hour local day).
  assertEquals(b.startUtc, "2026-03-08T05:00:00.000Z");
  assertEquals(b.endUtc,   "2026-03-09T04:00:00.000Z");
});

Deno.test("localDayBoundsUtc: London BST fall-back day (2026-10-25) is 25 h", () => {
  const b = localDayBoundsUtc("2026-10-25", "Europe/London");
  // 00:00 BST = 23:00Z the previous day. Next local midnight is 00:00
  // GMT = 00:00Z on 2026-10-26 (25-hour local day).
  assertEquals(b.startUtc, "2026-10-24T23:00:00.000Z");
  assertEquals(b.endUtc,   "2026-10-26T00:00:00.000Z");
});

// ── DND crossing midnight ──────────────────────────────────────────
Deno.test("DND 21:30–08:00: blocks 22:00 and 07:00", () => {
  assert(isHourInDndWindow(22, 21, 8));
  assert(isHourInDndWindow(7,  21, 8));
});

Deno.test("DND 21:30–08:00: does NOT block 12:00 or 18:00", () => {
  assert(!isHourInDndWindow(12, 21, 8));
  assert(!isHourInDndWindow(18, 21, 8));
});

Deno.test("DND same-day 12:00–14:00: blocks 13, not 15", () => {
  assert(isHourInDndWindow(13, 12, 14));
  assert(!isHourInDndWindow(15, 12, 14));
});

Deno.test("DND null/undefined: never blocks", () => {
  assert(!isHourInDndWindow(3, null, 8));
  assert(!isHourInDndWindow(3, 21, null));
  assert(!isHourInDndWindow(3, undefined, undefined));
});

// ── Quiet day computed from local weekday ─────────────────────────
Deno.test("quiet-day: local weekday differs from UTC weekday near midnight", () => {
  // 2026-07-11T23:00Z is Sat 23:00Z; Kolkata local is Sun 04:30.
  const parts = localParts("Asia/Kolkata", new Date("2026-07-11T23:00:00Z"));
  const localDow = new Date(`${parts.localDate}T12:00:00Z`).getUTCDay();
  assertEquals(localDow, 0); // Sunday
});
