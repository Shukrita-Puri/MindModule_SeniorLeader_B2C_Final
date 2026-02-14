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

async function callFunction(body: Record<string, unknown>): Promise<{ status: number; data: OuterReadinessResult | { error: string } }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ==================== THEME SELECTION TESTS ====================

Deno.test("Depleted + high pressure + high load → 'One thing at a time.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 25,
    calendarLoad: "high",
    calendarPressure: "high",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "One thing at a time.");
  assertEquals(result.driver, "pressure+load");
});

Deno.test("Peak + high pressure + high load → 'Peak performance day.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-2",
    innerReadinessTier: "peak",
    innerReadinessScore: 85,
    calendarLoad: "high",
    calendarPressure: "high",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Peak performance day.");
});

Deno.test("Strong + medium load + no pressure → 'Invest the advantage.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-3",
    innerReadinessTier: "strong",
    innerReadinessScore: 65,
    calendarLoad: "medium",
    calendarPressure: "low",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Invest the advantage.");
});

Deno.test("Managing + low load → 'Build your reserves.'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-theme-4",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    calendarLoad: "low",
    calendarPressure: "low",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.phrase, "Build your reserves.");
});

// ==================== NO-CALENDAR FALLBACK TESTS ====================

Deno.test("Depleted + no calendar + score 20 → 'Begin with stillness.'", async () => {
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
  assertEquals(result.driver, "state");
});

Deno.test("Peak + no calendar + score 92 → 'Own your peak.'", async () => {
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

// ==================== LEAN ON / WATCH FOR CASCADE TESTS ====================

Deno.test("Archetype priority 3: adaptive-navigator + depleted → archetype lean-on/watch-for", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-archetype-1",
    innerReadinessTier: "depleted",
    innerReadinessScore: 30,
    calendarLoad: "low",
    calendarPressure: "low",
    archetype: "adaptive-navigator",
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.leanOn, "Your ability to read what a situation actually needs — even in a depleted state your situational awareness is sharp.");
  assertEquals(result.watchFor, "Adapting to everyone else's demands when your own capacity is the priority.");
});

Deno.test("C+C modifier priority 2: low clarity + low confidence → C+C lean-on/watch-for", async () => {
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
  // C+C low overrides archetype (priority 2 > priority 3)
  assertEquals(result.leanOn, "Your awareness that today needs more deliberation than momentum.");
});

Deno.test("Tier fallback priority 4: no archetype, neutral C+C → tier fallback", async () => {
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
  assertEquals(result.leanOn, "Your above-baseline readiness — a real asset that is worth protecting through the day.");
});

// ==================== DATA SOURCES (FOOTER) TESTS ====================

Deno.test("Footer: no calendar, no archetype → only 'inner readiness score'", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-1",
    innerReadinessTier: "managing",
    innerReadinessScore: 50,
    calendarLoad: null,
    calendarPressure: null,
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.dataSources, ["inner readiness score"]);
});

Deno.test("Footer: with calendar + archetype → all three sources", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-2",
    innerReadinessTier: "strong",
    innerReadinessScore: 70,
    calendarLoad: "high",
    calendarPressure: "medium",
    archetype: "natural-regulator",
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.dataSources, ["inner readiness score", "calendar", "archetype"]);
});

Deno.test("Footer: with calendar, no archetype → two sources", async () => {
  const { status, data } = await callFunction({
    userId: "test-user-footer-3",
    innerReadinessTier: "depleted",
    innerReadinessScore: 25,
    calendarLoad: "low",
    calendarPressure: "low",
    archetype: null,
    clarityLevel: null,
    confidenceLevel: null,
    checkInOutcome: null,
  });
  assertEquals(status, 200);
  const result = data as OuterReadinessResult;
  assertEquals(result.dataSources, ["inner readiness score", "calendar"]);
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
  // No userId and no auth header
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
