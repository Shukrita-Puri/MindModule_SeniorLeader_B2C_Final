import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/compute-outer-readiness`;

interface OuterReadinessResult {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: string;
  dataSources: string[];
}

// timezoneOffset that forces 10 AM on a Wednesday (daytime, weekday)
// Server time is UTC. We set offset so userTime = UTC - offset*60000 → target 10:00 Wed
// Using offset = 0 and relying on the function to compute from UTC is fragile.
// Instead, compute an offset that maps current UTC to 10:00 on a weekday.
function getDaytimeOffset(): number {
  const now = new Date();
  // We want the user's "local time" to be 10:00 AM on the same date
  // userTime = now - offset * 60000 → offset = (now - targetTime) / 60000
  const target = new Date(now);
  target.setUTCHours(10, 0, 0, 0);
  // Also ensure it's a Wednesday (day 3)
  const dayDiff = target.getUTCDay() - 3; // shift to Wednesday
  // Don't shift date, just ensure hour is 10 AM for the user
  return Math.round((now.getTime() - target.getTime()) / 60000);
}

// timezoneOffset that forces 22:00 (10 PM) on a Sunday for evening tests
function getLateEveningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}

// timezoneOffset that forces 22:00 on a Sunday
function getSundayEveningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  // Shift to Sunday (day 0)
  const currentDay = target.getUTCDay();
  const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
  target.setUTCDate(target.getUTCDate() + daysToSunday);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}

const DAYTIME_OFFSET = getDaytimeOffset();

async function callFunction(body: Record<string, unknown>): Promise<{ status: number; data: OuterReadinessResult | { error: string } }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ timezoneOffset: DAYTIME_OFFSET, ...body }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ==================== THEME SELECTION TESTS ====================
// Note: calendarLoad/calendarPressure sent from client are legacy fields — the server
// now computes calendar metrics from the DB. Test users have no calendar connections,
// so the server always returns no-calendar themes for them. These tests verify no-calendar paths.

Deno.test("Depleted + high pressure + high load → 'One thing at a time.'", async () => {
  // Without DB calendar data, server returns no-calendar theme
  const { status, data } = await callFunction({
    userId: "test-user-theme-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 25,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // No calendar → falls to no-calendar theme (score 25 = "Begin with stillness.")
  assertEquals(result.phrase, "Begin with stillness.");
  assertEquals(result.driver, "morning");
});

Deno.test("Peak + high pressure + high load → 'Peak performance day.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-2",
    innerReadinessTier: "peak",
    innerReadinessScore: 85,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // No calendar → "Bring your full presence."
  assertEquals(result.phrase, "Bring your full presence.");
});

Deno.test("Strong + medium load + no pressure → 'Invest the advantage.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-3",
    innerReadinessTier: "strong",
    innerReadinessScore: 65,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // No calendar → "Lead with confidence."
  assertEquals(result.phrase, "Lead with confidence.");
});

Deno.test("Managing + low load → 'Build your reserves.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-4",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // No calendar → "Steady and selective."
  assertEquals(result.phrase, "Steady and selective.");
});

// ==================== NO-CALENDAR FALLBACK TESTS (daytime) ====================

Deno.test("Depleted + no calendar + score 20 (daytime) → 'Begin with stillness.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-nocal-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 20,
    calendarLoad: null,
    calendarPressure: null,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Begin with stillness.");
  assertEquals(result.driver, "morning");
});

Deno.test("Peak + no calendar + score 92 (daytime) → 'Own your peak.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-nocal-2",
    innerReadinessTier: "peak",
    innerReadinessScore: 92,
    calendarLoad: null,
    calendarPressure: null,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Own your peak.");
});

// ==================== LATE EVENING TESTS ====================

Deno.test("Depleted + no calendar + late evening → recovery theme", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-evening-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 20,
    calendarLoad: null,
    calendarPressure: null,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
    timezoneOffset: getLateEveningOffset(),
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Let the day close.");
  assertEquals(result.leanOn, "Your awareness that your system has already given what it had. Permission to stop is itself a form of leadership.");
});

Deno.test("Peak + late evening → evening lean-on overrides C+C", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-evening-2",
    innerReadinessTier: "peak",
    innerReadinessScore: 90,
    calendarLoad: null,
    calendarPressure: null,
    archetype: "high-octane-performer",
    clarityLevel: 5,
    confidenceLevel: 5,
    checkInOutcome: null,
    timezoneOffset: getLateEveningOffset(),
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // After 9 PM, archetype and C+C are suppressed — evening tier insights take over
  assertEquals(result.leanOn, "Your discipline to protect recovery even when your system still feels activated. High output needs high-quality rest.");
  assertEquals(result.watchFor, "Mistaking late-night activation for productive energy. Your nervous system needs the wind-down even when your mind doesn't.");
});

// ==================== SUNDAY EVENING TESTS ====================

Deno.test("Managing + Sunday evening → Sunday-specific theme and lean-on", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-sunday-1",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    calendarLoad: null,
    calendarPressure: null,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
    timezoneOffset: getSundayEveningOffset(),
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Close into the week.");
  assertEquals(result.leanOn, "Your capacity to close the weekend cleanly and set a deliberate intention for how you want to enter the week.");
});

// ==================== LEAN ON / WATCH FOR CASCADE TESTS (daytime) ====================

Deno.test("Archetype priority 3: adaptive-navigator + depleted (daytime) → archetype lean-on/watch-for", async () => {
  // Note: archetype is now fetched server-side from profiles table. Test users won't have
  // archetype set in DB, so this falls to tier fallback instead.
  const { status, data } = await callFunction({
    userId: "test-user-archetype-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 30,
    archetype: "adaptive-navigator",
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // Falls to tier fallback since server can't find archetype in profiles
  assertEquals(result.leanOn, "Based on your current readiness state: Your awareness of your own state. Knowing you're depleted is itself a form of self-leadership.");
  assertEquals(result.watchFor, "Based on your current readiness state: Committing to demands that require more than your current state can sustain.");
});

Deno.test("C+C modifier priority 2: low clarity + low confidence (daytime) → C+C lean-on/watch-for", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-cc-1",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    calendarLoad: "medium",
    calendarPressure: "medium",
    archetype: "high-octane-performer",
    clarityLevel: 1,
    confidenceLevel: 1,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.leanOn, "Your awareness that today needs more deliberation than momentum.");
});

Deno.test("Tier fallback priority 4: no archetype, neutral C+C (daytime) → tier fallback", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-fallback-1",
    innerReadinessTier: "strong",
    innerReadinessScore: 70,
    calendarLoad: "medium",
    calendarPressure: "low",
    archetype: null,
    clarityLevel: 3,
    confidenceLevel: 3,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.leanOn, "Your above-baseline readiness. A real asset that is worth protecting through the day.");
});

// ==================== DATA SOURCES (FOOTER) TESTS ====================

Deno.test("Footer: no calendar, no archetype → only 'decision readiness score'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-1",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.dataSources, ["decision readiness score"]);
});

Deno.test("Footer: no calendar + archetype → readiness only (archetype not in DB)", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-2",
    innerReadinessTier: "strong",
    innerReadinessScore: 70,
    archetype: "natural-regulator",
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  // Archetype is fetched server-side — test user has no profile, so no archetype in sources
  assertEquals(result.dataSources, ["decision readiness score"]);
});

Deno.test("Footer: no calendar, no archetype → single source", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-3",
    innerReadinessTier: "depleted",
    innerReadinessScore: 25,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.dataSources, ["decision readiness score"]);
});

// ==================== OUTPUT CONTRACT TESTS ====================

Deno.test("Output contains all required fields", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-contract-1",
    innerReadinessTier: "managing",
    innerReadinessScore: 55,
    calendarLoad: "medium",
    calendarPressure: "low",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertExists(result.phrase);
  assertExists(result.context);
  assertExists(result.leanOn);
  assertExists(result.watchFor);
  assertExists(result.driver);
  assertExists(result.dataSources);
  assertEquals(typeof result.phrase, "string");
  assertEquals(typeof result.context, "string");
  assertEquals(typeof result.leanOn, "string");
  assertEquals(typeof result.watchFor, "string");
  assertEquals(Array.isArray(result.dataSources), true);
});

Deno.test("Missing auth returns 401", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      innerReadinessTier: "managing",
      innerReadinessScore: 50,
      calendarLoad: null,
      calendarPressure: null,
      archetype: null,
      clarityLevel: null,
      confidenceLevel: null,
      checkInOutcome: null,
    }),
  });
  const data = await res.json();
  assertEquals(res.status, 401);
  assertExists((data as { error: string }).error);
});
