/**
 * §2.19.5 BODY COPY: ASSESSMENT CONTRACT — server-side validator tests
 *
 * These tests exercise the validator added to validateV61Output() that enforces:
 *   RULE 1: never restate the numeric score or tier label in body
 *   RULE 2: never produce a data-list body (≥2 metric qualifiers)
 *
 * We test the live edge function via permutations of (wearable × calendar × check-in).
 * For each permutation we assert the returned body is contract-compliant. A non-compliant
 * LLM output is rejected by the validator and the server falls back to the deterministic
 * brief — which is itself contract-compliant by construction. Either way, the server
 * response should never contain a score restatement or a metric list.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/compute-outer-readiness`;

interface Result {
  phrase: string;
  context: string;
  bodyText?: string;
  briefSource?: 'llm' | 'deterministic';
  hasWearable?: boolean;
  calendarState?: string;
  dataSources: string[];
}

function midMorningOffset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(10, 0, 0, 0);
  return Math.round((now.getTime() - target.getTime()) / 60000);
}

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Result }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ timezoneOffset: midMorningOffset(), ...body }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ==================== CONTRACT ASSERTIONS ====================

function assertBodyContract(body: string, label: string) {
  const stripped = body.replace(/<[^>]+>/g, '');

  // RULE 1 — no numeric score restatement
  assert(!/\b\d{1,3}\s*\/\s*100\b/.test(stripped),
    `[${label}] body restates score X/100: "${stripped}"`);
  assert(!/\b(score\s+(of|is)|your\s+score|readiness\s+score)\b/i.test(stripped),
    `[${label}] body uses score phrase: "${stripped}"`);
  assert(!/\b\d{1,3}\s+out\s+of\s+100\b/i.test(stripped),
    `[${label}] body says "X out of 100": "${stripped}"`);

  // RULE 1b — no tier-label restatement
  assert(!/\b(you(?:'re|\sare)\s+(depleted|managing|strong|peak)|(?:in|at)\s+(depleted|managing|strong|peak)\s+(?:state|tier|today))\b/i.test(stripped),
    `[${label}] body restates tier label: "${stripped}"`);

  // RULE 2 — no metric list (≥2 metric qualifiers)
  const metricPattern = /\b(HRV|RHR|HR|sleep|bpm)\b[^.,;]{0,40}?(\d+\s*(%|h\b|hr|hrs|hours?|bpm|min)|\d+\s*(?:%|h\b)\s*(?:below|above|under|over|down|up))/gi;
    const metrics = stripped.match(metricPattern) || [];
  assert(metrics.length < 2,
    `[${label}] body is a metric list (${metrics.length} metrics): "${stripped}" — matched: ${JSON.stringify(metrics)}`);

  // Non-empty
  assert(stripped.trim().length > 10, `[${label}] body too short: "${stripped}"`);
}

// ==================== PERMUTATIONS ====================

const PERMUTATIONS: Array<{ name: string; body: Record<string, unknown> }> = [
  // ---------- DEPLETED tier ----------
  { name: "depleted + no wearable + no calendar + no check-in", body: {
      userId: "test-body-d1", innerReadinessTier: "depleted", innerReadinessScore: 28,
      clarityLevel: null, confidenceLevel: null, checkInOutcome: null } },
  { name: "depleted + low clarity + low confidence (no wearable)", body: {
      userId: "test-body-d2", innerReadinessTier: "depleted", innerReadinessScore: 25,
      clarityLevel: 1, confidenceLevel: 1, checkInOutcome: "depleted" } },
  { name: "depleted + masked-high (felt strong, low score)", body: {
      userId: "test-body-d3", innerReadinessTier: "depleted", innerReadinessScore: 30,
      clarityLevel: 5, confidenceLevel: 5, checkInOutcome: "strong" } },

  // ---------- MANAGING tier ----------
  { name: "managing + neutral check-in", body: {
      userId: "test-body-m1", innerReadinessTier: "managing", innerReadinessScore: 50,
      clarityLevel: 3, confidenceLevel: 3, checkInOutcome: "managing" } },
  { name: "managing + high clarity + low confidence", body: {
      userId: "test-body-m2", innerReadinessTier: "managing", innerReadinessScore: 55,
      clarityLevel: 5, confidenceLevel: 1, checkInOutcome: "managing" } },
  { name: "managing + low clarity + high confidence", body: {
      userId: "test-body-m3", innerReadinessTier: "managing", innerReadinessScore: 52,
      clarityLevel: 1, confidenceLevel: 5, checkInOutcome: "managing" } },

  // ---------- STRONG tier ----------
  { name: "strong + balanced check-in", body: {
      userId: "test-body-s1", innerReadinessTier: "strong", innerReadinessScore: 70,
      clarityLevel: 4, confidenceLevel: 4, checkInOutcome: "strong" } },
  { name: "strong + high mental sharpness", body: {
      userId: "test-body-s2", innerReadinessTier: "strong", innerReadinessScore: 72,
      clarityLevel: 5, confidenceLevel: 4, mentalSharpnessLevel: 5, checkInOutcome: "strong" } },

  // ---------- PEAK tier ----------
  { name: "peak + all systems strong", body: {
      userId: "test-body-p1", innerReadinessTier: "peak", innerReadinessScore: 88,
      clarityLevel: 5, confidenceLevel: 5, checkInOutcome: "strong" } },
  { name: "peak + slight clarity dip", body: {
      userId: "test-body-p2", innerReadinessTier: "peak", innerReadinessScore: 85,
      clarityLevel: 3, confidenceLevel: 5, checkInOutcome: "strong" } },

  // ---------- Edge: no check-in at all ----------
  { name: "managing + cold-start (no check-in fields)", body: {
      userId: "test-body-cs1", innerReadinessTier: "managing", innerReadinessScore: 50 } },
];

for (const p of PERMUTATIONS) {
  Deno.test(`Body contract: ${p.name}`, async () => {
    const { status, data } = await call(p.body);
    assertEquals(status, 200, `non-200 for ${p.name}`);
    const body = data.bodyText ?? data.context;
    assert(typeof body === "string" && body.length > 0, `empty body for ${p.name}`);
    assertBodyContract(body, p.name);
  });
}

// ==================== DIRECT CONTRACT-VIOLATION ASSERTIONS ====================
// Sanity-check the assertion helper itself catches the patterns we care about.

Deno.test("assertBodyContract catches '31/100'", () => {
  let threw = false;
  try { assertBodyContract("Mind is taxed today, score is 31/100 and the day is heavy.", "self-test"); }
  catch { threw = true; }
  assert(threw, "assertion should fail on X/100");
});

Deno.test("assertBodyContract catches 'score of 31'", () => {
  let threw = false;
  try { assertBodyContract("With a score of 31, you should rest.", "self-test"); }
  catch { threw = true; }
  assert(threw, "assertion should fail on 'score of N'");
});

Deno.test("assertBodyContract catches metric list", () => {
  let threw = false;
  try { assertBodyContract("HRV is 20% below baseline and RHR is 18% below baseline today.", "self-test"); }
  catch { threw = true; }
  assert(threw, "assertion should fail on 2+ metric qualifiers");
});

Deno.test("assertBodyContract accepts assessment-led copy", () => {
  // No score, no metric list, just synthesis
  assertBodyContract(
    "Body is recovered but Mind is carrying the strain — the calendar adds three high-stakes touchpoints before lunch. The day's edge is sequencing.",
    "self-test"
  );
});

Deno.test("assertBodyContract accepts single-metric qualifier", () => {
  // One metric used as qualifier — allowed
  assertBodyContract(
    "Mind is carrying the strain — HRV's 20% drop is the lever, not the headline. Front-load the heavy work.",
    "self-test"
  );
});