/**
 * Tests for home-country weekend and planning-day logic.
 * Covers: tzToCountry, planningDayOfWeek, evaluateWeekAheadMode, user-locale.
 * Pure logic — no DB, no network.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { tzToCountry } from "./tz-to-country.ts";
import { planningDayOfWeek, resolveUserLocaleContext } from "./user-locale.ts";
import { evaluateWeekAheadMode } from "./week-ahead-mode.ts";

// ── tzToCountry ───────────────────────────────────────────────────────────────

Deno.test("tzToCountry: Gulf timezones map to Fri-Sat weekend countries", () => {
  assertEquals(tzToCountry("Asia/Riyadh"), "SA");
  assertEquals(tzToCountry("Asia/Kuwait"), "KW");
  assertEquals(tzToCountry("Asia/Doha"), "QA");
  assertEquals(tzToCountry("Asia/Bahrain"), "BH");
  assertEquals(tzToCountry("Asia/Muscat"), "OM");
  assertEquals(tzToCountry("Asia/Jerusalem"), "IL");
});

Deno.test("tzToCountry: UK, US, India return Sat-Sun weekend countries", () => {
  assertEquals(tzToCountry("Europe/London"), "GB");
  assertEquals(tzToCountry("America/New_York"), "US");
  assertEquals(tzToCountry("Asia/Kolkata"), "IN");
  assertEquals(tzToCountry("Asia/Calcutta"), "IN"); // legacy alias
});

Deno.test("tzToCountry: unknown timezone returns null, not throws", () => {
  assertEquals(tzToCountry("Mars/Olympus"), null);
  assertEquals(tzToCountry(null), null);
  assertEquals(tzToCountry(undefined), null);
});

// ── planningDayOfWeek ─────────────────────────────────────────────────────────

Deno.test("planningDayOfWeek: Gulf/Israel countries return 6 (Saturday)", () => {
  assertEquals(planningDayOfWeek("SA"), 6);
  assertEquals(planningDayOfWeek("KW"), 6);
  assertEquals(planningDayOfWeek("QA"), 6);
  assertEquals(planningDayOfWeek("BH"), 6);
  assertEquals(planningDayOfWeek("OM"), 6);
  assertEquals(planningDayOfWeek("IL"), 6);
});

Deno.test("planningDayOfWeek: UK, US, India return 0 (Sunday)", () => {
  assertEquals(planningDayOfWeek("GB"), 0);
  assertEquals(planningDayOfWeek("US"), 0);
  assertEquals(planningDayOfWeek("IN"), 0);
});

Deno.test("planningDayOfWeek: null/unknown defaults to 0 (Sunday)", () => {
  assertEquals(planningDayOfWeek(null), 0);
  assertEquals(planningDayOfWeek(undefined), 0);
  assertEquals(planningDayOfWeek(""), 0);
  assertEquals(planningDayOfWeek("ZZ"), 0);
});

// ── evaluateWeekAheadMode: UK user ────────────────────────────────────────────

Deno.test("Week-Ahead: UK user on Sunday → active (weekly_planning)", () => {
  // Sunday = day 0
  const result = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 10,
    homeCountry: "GB",
  });
  assertEquals(result.active, true);
  assertEquals(result.reason, "weekly_planning");
});

Deno.test("Week-Ahead: UK user on Saturday → inactive", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 6,
    localHour: 10,
    homeCountry: "GB",
  });
  assertEquals(result.active, false);
});

Deno.test("Week-Ahead: UK user on Friday → inactive", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 5,
    localHour: 10,
    homeCountry: "GB",
  });
  assertEquals(result.active, false);
});

// ── evaluateWeekAheadMode: Gulf/Israel user ───────────────────────────────────

Deno.test("Week-Ahead: Saudi user on Saturday → active (weekly_planning)", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 6,
    localHour: 10,
    homeCountry: "SA",
  });
  assertEquals(result.active, true);
  assertEquals(result.reason, "weekly_planning");
});

Deno.test("Week-Ahead: Saudi user on Sunday → inactive (workday)", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 10,
    homeCountry: "SA",
  });
  assertEquals(result.active, false);
});

Deno.test("Week-Ahead: Israel user on Saturday → active", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 6,
    localHour: 10,
    homeCountry: "IL",
  });
  assertEquals(result.active, true);
});

Deno.test("Week-Ahead: Israel user on Friday → inactive (recovery day, not planning)", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 5,
    localHour: 10,
    homeCountry: "IL",
  });
  assertEquals(result.active, false);
});

// ── D1: Travel does NOT change planning day ───────────────────────────────────

Deno.test("D1: UK user in Dubai on Sunday still plans on Sunday (home country wins)", () => {
  // Scenario: home=GB (Sunday planner), travelling in AE (Fri-Sat planner)
  // dayOfWeek derived from HOME timezone = Sunday = 0
  const result = evaluateWeekAheadMode({
    dayOfWeek: 0, // Sunday in London time (what the user experiences as their week boundary)
    localHour: 10,
    homeCountry: "GB", // home country, not travel country
  });
  assertEquals(result.active, true);
  assertEquals(result.reason, "weekly_planning");
});

Deno.test("D1: Gulf user in London on Sunday does NOT get UK planning day", () => {
  // Scenario: home=SA (Saturday planner), visiting London
  // dayOfWeek=0 (Sunday), homeCountry=SA -> planning day is Saturday (6) -> not today
  const result = evaluateWeekAheadMode({
    dayOfWeek: 0, // Sunday — a workday for SA users
    localHour: 10,
    homeCountry: "SA",
  });
  assertEquals(result.active, false); // Sunday is a workday for this user
});

// ── resolveUserLocaleContext ──────────────────────────────────────────────────

Deno.test("resolveUserLocaleContext: SA homeCountry gives weekendDays=[5,6]", () => {
  const ctx = resolveUserLocaleContext({
    localDate: "2026-08-01",   // Saturday
    utcNowMs: Date.UTC(2026, 7, 1, 10),
    homeCountry: "SA",
    timezone: "Asia/Riyadh",
    timezoneOffsetMinutes: -180,
  });
  assertEquals(ctx.weekendDays, [5, 6]);
  assertEquals(ctx.planningDayOfWeek, 6);
  assertEquals(ctx.isWeekendRestDay, true); // Saturday = weekend for SA
});

Deno.test("resolveUserLocaleContext: GB homeCountry gives weekendDays=[0,6]", () => {
  const ctx = resolveUserLocaleContext({
    localDate: "2026-08-02",   // Sunday
    utcNowMs: Date.UTC(2026, 7, 2, 10),
    homeCountry: "GB",
    timezone: "Europe/London",
    timezoneOffsetMinutes: 60,
  });
  assertEquals(ctx.weekendDays, [0, 6]);
  assertEquals(ctx.planningDayOfWeek, 0);
  assertEquals(ctx.isWeekendRestDay, true); // Sunday = weekend for GB
});

Deno.test("resolveUserLocaleContext: null homeCountry defaults to Sunday planning", () => {
  const ctx = resolveUserLocaleContext({
    localDate: "2026-08-02",
    utcNowMs: Date.UTC(2026, 7, 2, 10),
    homeCountry: null,
    timezone: "UTC",
    timezoneOffsetMinutes: 0,
  });
  assertEquals(ctx.planningDayOfWeek, 0); // Sunday default
  assertEquals(ctx.weekendDays, [0, 6]);
});

// ── fail-open: evaluateWeekAheadMode with null homeCountry ────────────────────

Deno.test("evaluateWeekAheadMode: null homeCountry on Sunday → active (safe default)", () => {
  const result = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 10,
    homeCountry: null,
  });
  assertEquals(result.active, true); // Sunday is correct default for most users
  assertEquals(result.reason, "weekly_planning");
});
// ── null profiles.country → timezone fallback ────────────────────────────────

Deno.test("null country + home_timezone Asia/Riyadh resolves to SA / Saturday planning", () => {
  const country: string | null = null;
  const homeTimezone = "Asia/Riyadh";
  const resolved = country ?? tzToCountry(homeTimezone) ?? null;
  assertEquals(resolved, "SA");
  assertEquals(planningDayOfWeek(resolved), 6);

  const ctx = resolveUserLocaleContext({
    localDate: "2026-08-08", // Saturday
    utcNowMs: Date.UTC(2026, 7, 8, 8),
    homeCountry: resolved,
    timezone: homeTimezone,
    timezoneOffsetMinutes: -180,
  });
  assertEquals(ctx.homeCountry, "SA");
  assertEquals(ctx.weekendDays, [5, 6]);
  assertEquals(ctx.planningDayOfWeek, 6);
});

Deno.test("null country + home_timezone Europe/London resolves to GB / Sunday planning", () => {
  const resolved = null ?? tzToCountry("Europe/London") ?? null;
  assertEquals(resolved, "GB");
  assertEquals(planningDayOfWeek(resolved), 0);
});
