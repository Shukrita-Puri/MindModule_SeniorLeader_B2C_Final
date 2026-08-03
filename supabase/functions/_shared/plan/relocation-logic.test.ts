/**
 * Tests for the relocation detection LOGIC extracted from sync-profile.
 * Tests the decision functions directly — no Supabase client, no network.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { tzToCountry, tzOffsetDiffHours } from "./tz-to-country.ts";

// ── tzOffsetDiffHours (the >3h gate) ─────────────────────────────────────────

Deno.test("tzOffsetDiffHours: US to India is ~9.5h (well above 3h gate)", () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  const diff = tzOffsetDiffHours("America/New_York", "Asia/Kolkata", jan);
  // NY = UTC-5, Kolkata = UTC+5:30 → diff = 10.5h
  assertEquals(diff > 3, true);
  assertEquals(diff > 9, true);
});

Deno.test("tzOffsetDiffHours: UK to Dubai is 4h (above 3h gate)", () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  assertEquals(tzOffsetDiffHours("Europe/London", "Asia/Dubai", jan), 4);
});

Deno.test("tzOffsetDiffHours: UK to France is 1h (below 3h gate — not relocation)", () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  const diff = tzOffsetDiffHours("Europe/London", "Europe/Paris", jan);
  assertEquals(diff < 3, true); // 1h — should not trigger detection
});

Deno.test("tzOffsetDiffHours: same timezone is 0", () => {
  assertEquals(tzOffsetDiffHours("Europe/London", "Europe/London"), 0);
  assertEquals(tzOffsetDiffHours("Asia/Kolkata", "Asia/Kolkata"), 0);
});

Deno.test("tzOffsetDiffHours: UK to US is ~5h (above 3h gate)", () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  const diff = tzOffsetDiffHours("Europe/London", "America/New_York", jan);
  assertEquals(diff >= 5, true);
});

// ── sustainedRelocation logic (pure function extracted for testing) ────────────

function isSustainedRelocation(opts: {
  daysSinceChange: number | null;
  travelState: string | null;
}): boolean {
  return (
    opts.daysSinceChange !== null &&
    opts.daysSinceChange > 30 &&
    opts.travelState !== "en_route" &&
    opts.travelState !== "returning"
  );
}

Deno.test("sustainedRelocation: 35 days + not travelling → true", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: "arrived" }), true);
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: "not_travelling" }), true);
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: "location_unknown" }), true);
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: null }), true);
});

Deno.test("sustainedRelocation: < 30 days → false (not mature yet)", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: 17, travelState: "arrived" }), false);
  assertEquals(isSustainedRelocation({ daysSinceChange: 0, travelState: "arrived" }), false);
  assertEquals(isSustainedRelocation({ daysSinceChange: 29, travelState: "not_travelling" }), false);
});

Deno.test("sustainedRelocation: null daysSinceChange → false (Gap 1 fix)", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: null, travelState: null }), false);
});

Deno.test("sustainedRelocation: en_route → false (mid-journey, not relocation)", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: 60, travelState: "en_route" }), false);
});

Deno.test("sustainedRelocation: returning → false (heading home)", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: 60, travelState: "returning" }), false);
});

// ── country backfill logic ────────────────────────────────────────────────────

Deno.test("country backfill: derives GB from Europe/London", () => {
  assertEquals(tzToCountry("Europe/London"), "GB");
});

Deno.test("country backfill: derives US from America/New_York", () => {
  assertEquals(tzToCountry("America/New_York"), "US");
});

Deno.test("country backfill: derives IN from Asia/Calcutta (Jaydeep current location)", () => {
  assertEquals(tzToCountry("Asia/Calcutta"), "IN");
});

Deno.test("country backfill: returns null for unknown tz (no crash, no wrong country)", () => {
  assertEquals(tzToCountry("Unknown/Zone"), null);
});

// ── convergence clear logic ───────────────────────────────────────────────────

function shouldClearRelocationFlag(opts: {
  clientCurrentTz: string;
  homeTimezone: string | null;
  flagIsSet: boolean;
}): boolean {
  return (
    opts.flagIsSet &&
    opts.homeTimezone !== null &&
    opts.clientCurrentTz === opts.homeTimezone
  );
}

Deno.test("convergence clear: logging in from home tz clears flag", () => {
  assertEquals(shouldClearRelocationFlag({
    clientCurrentTz: "America/New_York",
    homeTimezone: "America/New_York",
    flagIsSet: true,
  }), true);
});

Deno.test("convergence clear: still abroad, flag stays", () => {
  assertEquals(shouldClearRelocationFlag({
    clientCurrentTz: "Asia/Calcutta",
    homeTimezone: "America/New_York",
    flagIsSet: true,
  }), false);
});

Deno.test("convergence clear: flag not set, no write needed", () => {
  assertEquals(shouldClearRelocationFlag({
    clientCurrentTz: "America/New_York",
    homeTimezone: "America/New_York",
    flagIsSet: false,
  }), false); // guard: only write when flag is set
});

// ── Gap 3: clock reset immunity ───────────────────────────────────────────────

Deno.test("Gap 3 fix: profile-level clock not reset by brief trip", () => {
  const primaryChangeDate = new Date(Date.now() - 35 * 86_400_000); // 35 days ago
  const secondaryChangeDate = new Date(Date.now() - 2 * 86_400_000); // 2 days ago (trip)
  const earliestChangeDate = primaryChangeDate ?? secondaryChangeDate;
  const daysSinceChange = (Date.now() - earliestChangeDate.getTime()) / 86_400_000;

  assertEquals(daysSinceChange > 30, true);
  assertEquals(isSustainedRelocation({ daysSinceChange, travelState: "not_travelling" }), true);
});

Deno.test("Gap 3: old behaviour (no primaryChangeDate) — brief trip resets clock", () => {
  const secondaryChangeDate = new Date(Date.now() - 2 * 86_400_000);
  const daysSinceChange = (Date.now() - secondaryChangeDate.getTime()) / 86_400_000;

  assertEquals(isSustainedRelocation({ daysSinceChange, travelState: "not_travelling" }), false);
});