/**
 * §2.18.5 NON-REDUNDANCY E2E CONTRACT
 *
 * leanOn and watchFor MUST add information the body did not already say.
 * This file black-box-tests the live edge function across the full permutation
 * matrix used by body_copy.test.ts AND the cascade matrix used by index.test.ts,
 * asserting on every response that no leanOn/watchFor signal echoes a substring
 * of the body. Failures produce a clear diff naming the offending signal,
 * the body, and the overlapping phrase.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/compute-outer-readiness`;

interface Result {
  phrase: string;
  context: string;
  bodyText?: string;
  leanOn: string;       // "Signal · SOURCE"
  watchFor: string;     // "Signal · SOURCE"
  briefSource?: 'llm' | 'deterministic';
  dataSources: string[];
}

function midMorningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(10, 0, 0, 0);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}
function lateEveningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}
function sundayEveningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  const currentDay = target.getUTCDay();
  const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
  target.setUTCDate(target.getUTCDate() + daysToSunday);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}

async function call(body: Record<string, unknown>, tzOffset: number = midMorningOffset()): Promise<{ status: number; data: Result }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ timezoneOffset: tzOffset, ...body }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ==================== REDUNDANCY ASSERTION ====================

/** Strip HTML tags, lowercase, collapse whitespace */
function normalize(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Split "Signal · SOURCE" → "Signal". Tolerates missing source. */
function extractSignal(formatted: string): string {
  const idx = formatted.indexOf(' · ');
  return (idx >= 0 ? formatted.slice(0, idx) : formatted).trim();
}

/**
 * §2.18.5 redundancy guard. Mirrors the server-side validator
 * (signalLower.length >= 6 && bodyLower.includes(signalLower)).
 * Failures throw with a clear diff: signal, body, source label.
 */
function assertNoRedundancy(label: string, body: string, signalFormatted: string, side: 'leanOn' | 'watchFor') {
  const signal = extractSignal(signalFormatted);
  const signalLower = normalize(signal);
  const bodyLower = normalize(body);

  // Server's own threshold: signals < 6 chars are too short to be meaningful overlaps
  if (signalLower.length < 6) return;

  if (bodyLower.includes(signalLower)) {
    throw new Error(
      `[${label}] §2.18.5 REDUNDANCY VIOLATION (${side})
  ──────────────────────────────────────────────────────────
  Body:    "${body}"
  ${side}:  "${signalFormatted}"
  Overlap: body literally contains signal "${signal}".
  Fix:     ${side} must add new information (history/archetype/coach), not echo body wording.
  ──────────────────────────────────────────────────────────`
    );
  }

  // Stronger check: any 3+ word phrase in the signal that also appears in the body
  const sigWords = signalLower.split(/\s+/).filter(w => w.length >= 4);
  if (sigWords.length >= 3) {
    for (let i = 0; i <= sigWords.length - 3; i++) {
      const trigram = sigWords.slice(i, i + 3).join(' ');
      if (bodyLower.includes(trigram)) {
        throw new Error(
          `[${label}] §2.18.5 PARTIAL REDUNDANCY VIOLATION (${side})
  ──────────────────────────────────────────────────────────
  Body:    "${body}"
  ${side}:  "${signalFormatted}"
  Overlap: body contains 3-word phrase "${trigram}" from signal.
  ──────────────────────────────────────────────────────────`
        );
      }
    }
  }
}

function assertResult(label: string, data: Result) {
  const body = data.bodyText ?? data.context;
  assert(typeof body === "string" && body.length > 0, `[${label}] empty body`);
  assert(typeof data.leanOn === "string" && data.leanOn.length > 0, `[${label}] missing leanOn`);
  assert(typeof data.watchFor === "string" && data.watchFor.length > 0, `[${label}] missing watchFor`);
  assertNoRedundancy(label, body, data.leanOn, 'leanOn');
  assertNoRedundancy(label, body, data.watchFor, 'watchFor');
}

// ==================== PERMUTATION MATRIX ====================
// Mirrors body_copy.test.ts permutations + adds calendar/late-evening/Sunday/archetype
// branches from index.test.ts so every code path is exercised for redundancy.

const DAYTIME_PERMUTATIONS: Array<{ name: string; body: Record<string, unknown> }> = [
  // DEPLETED
  { name: "redundancy/depleted/no-context", body: { userId: "rd-d1", innerReadinessTier: "depleted", innerReadinessScore: 28 } },
  { name: "redundancy/depleted/low-cc", body: { userId: "rd-d2", innerReadinessTier: "depleted", innerReadinessScore: 25, clarityLevel: 1, confidenceLevel: 1, checkInOutcome: "depleted" } },
  { name: "redundancy/depleted/masked-high", body: { userId: "rd-d3", innerReadinessTier: "depleted", innerReadinessScore: 30, clarityLevel: 5, confidenceLevel: 5, checkInOutcome: "strong" } },
  // MANAGING
  { name: "redundancy/managing/neutral", body: { userId: "rd-m1", innerReadinessTier: "managing", innerReadinessScore: 50, clarityLevel: 3, confidenceLevel: 3, checkInOutcome: "managing" } },
  { name: "redundancy/managing/high-clarity-low-conf", body: { userId: "rd-m2", innerReadinessTier: "managing", innerReadinessScore: 55, clarityLevel: 5, confidenceLevel: 1, checkInOutcome: "managing" } },
  { name: "redundancy/managing/low-clarity-high-conf", body: { userId: "rd-m3", innerReadinessTier: "managing", innerReadinessScore: 52, clarityLevel: 1, confidenceLevel: 5, checkInOutcome: "managing" } },
  { name: "redundancy/managing/cold-start", body: { userId: "rd-m4", innerReadinessTier: "managing", innerReadinessScore: 50 } },
  // STRONG
  { name: "redundancy/strong/balanced", body: { userId: "rd-s1", innerReadinessTier: "strong", innerReadinessScore: 70, clarityLevel: 4, confidenceLevel: 4, checkInOutcome: "strong" } },
  { name: "redundancy/strong/high-mental-sharpness", body: { userId: "rd-s2", innerReadinessTier: "strong", innerReadinessScore: 72, clarityLevel: 5, confidenceLevel: 4, mentalSharpnessLevel: 5, checkInOutcome: "strong" } },
  // PEAK
  { name: "redundancy/peak/all-strong", body: { userId: "rd-p1", innerReadinessTier: "peak", innerReadinessScore: 88, clarityLevel: 5, confidenceLevel: 5, checkInOutcome: "strong" } },
  { name: "redundancy/peak/clarity-dip", body: { userId: "rd-p2", innerReadinessTier: "peak", innerReadinessScore: 85, clarityLevel: 3, confidenceLevel: 5, checkInOutcome: "strong" } },
  // ARCHETYPE × TIER cross-cuts
  { name: "redundancy/adaptive-navigator/depleted", body: { userId: "rd-arc1", innerReadinessTier: "depleted", innerReadinessScore: 30, archetype: "adaptive-navigator" } },
  { name: "redundancy/high-octane/managing", body: { userId: "rd-arc2", innerReadinessTier: "managing", innerReadinessScore: 50, archetype: "high-octane-performer", clarityLevel: 1, confidenceLevel: 1 } },
];

for (const p of DAYTIME_PERMUTATIONS) {
  Deno.test(p.name, async () => {
    const { status, data } = await call(p.body);
    assertEquals(status, 200, `[${p.name}] non-200`);
    assertResult(p.name, data);
  });
}

// ==================== EVENING + SUNDAY OVERRIDES ====================

Deno.test("redundancy/late-evening/depleted", async () => {
  const { status, data } = await call({
    userId: "rd-eve1", innerReadinessTier: "depleted", innerReadinessScore: 20,
  }, lateEveningOffset());
  assertEquals(status, 200);
  assertResult("redundancy/late-evening/depleted", data);
});

Deno.test("redundancy/late-evening/peak-with-cc", async () => {
  const { status, data } = await call({
    userId: "rd-eve2", innerReadinessTier: "peak", innerReadinessScore: 90,
    archetype: "high-octane-performer", clarityLevel: 5, confidenceLevel: 5,
  }, lateEveningOffset());
  assertEquals(status, 200);
  assertResult("redundancy/late-evening/peak-with-cc", data);
});

Deno.test("redundancy/sunday-evening/managing", async () => {
  const { status, data } = await call({
    userId: "rd-sun1", innerReadinessTier: "managing", innerReadinessScore: 50,
  }, sundayEveningOffset());
  assertEquals(status, 200);
  assertResult("redundancy/sunday-evening/managing", data);
});

// ==================== ASSERTION SELF-TESTS ====================

Deno.test("assertNoRedundancy catches direct echo", () => {
  let threw = false;
  try {
    assertNoRedundancy(
      "self-test",
      "Mind is sharp, body under load — pace the morning carefully.",
      "Body Under Load · PHYSIOLOGY",
      "leanOn"
    );
  } catch { threw = true; }
  assert(threw, "should reject signal that appears verbatim in body");
});

Deno.test("assertNoRedundancy catches partial-trigram echo", () => {
  let threw = false;
  try {
    assertNoRedundancy(
      "self-test",
      "Recovery intelligence available, calendar light — invest the surplus.",
      "Recovery Intelligence Window · ARCHETYPE",
      "leanOn"
    );
  } catch { threw = true; }
  assert(threw, "should reject 3-word overlap with body");
});

Deno.test("assertNoRedundancy passes for distinct signal", () => {
  // No throw expected
  assertNoRedundancy(
    "self-test",
    "Mind is sharp, body under load — pace the morning carefully.",
    "Post-rest decision window · PATTERN",
    "leanOn"
  );
});

Deno.test("assertNoRedundancy passes for short signals (< 6 chars)", () => {
  // Below the meaningful-overlap threshold; matches server-side validator
  assertNoRedundancy("self-test", "the day is heavy and the mind is sharp", "Sharp · ARCHETYPE", "leanOn");
});

Deno.test("assertNoRedundancy ignores HTML tags in body", () => {
  // Body wraps key phrases in <strong> — normalization must strip those before comparing
  let threw = false;
  try {
    assertNoRedundancy(
      "self-test",
      "Mind sharp — <strong>Recovery Intelligence is the lever</strong>.",
      "Recovery Intelligence · ARCHETYPE",
      "leanOn"
    );
  } catch { threw = true; }
  assert(threw, "should detect overlap even when body wraps phrase in HTML");
});