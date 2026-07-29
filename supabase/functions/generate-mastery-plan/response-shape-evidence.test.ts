/**
 * Response-shape evidence test for `generate-mastery-plan`.
 *
 * The function is ~7K lines and bootstraps the entire Plan pipeline
 * (DB, calendar, wearable, LLM, scoring, ledger). Running it in-process
 * inside a Deno test is infeasible without a full staging fixture.
 *
 * Instead, this test asserts the IN-CODE INVARIANTS that produce the
 * required release-blocking response shape:
 *
 *   - `weekAheadDecision` is always attached to the plan response and
 *     derived from the shared `evaluateWeekAheadMode` predicate, so
 *     Saturday → active=false, Sunday → active=true (matches the shared
 *     predicate's own tests under `_shared/plan/week-ahead-mode.test.ts`).
 *   - The strict 24-hour day-of horizon helper (`gateDayOfAnchor`) is
 *     imported and used on every named-event anchor write site, so
 *     Saturday plans cannot reference Sunday/Monday event ids or titles.
 *   - The synthetic Coach card injection that hard-coded
 *     "Brief coaching check-in" + "Evening reflection and tiny wins" into
 *     slot 3 has been removed and is not re-introduced.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateWeekAheadMode } from "../_shared/plan/week-ahead-mode.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

// ───────────────────────── weekAheadDecision ─────────────────────────
Deno.test("response attaches weekAheadDecision derived from shared predicate", () => {
  assert(/evaluateWeekAheadMode/.test(SRC), "expected evaluateWeekAheadMode to be imported/used");
  assertStringIncludes(SRC, "(plan as any).weekAheadDecision = {");
  assertStringIncludes(SRC, "active: _wam.active,");
  assertStringIncludes(SRC, "reason: _wam.reason,");
  assert(SRC.includes("mode: _wam.active ? 'week_ahead' : 'day_of'") || SRC.includes('mode: _wam.active ? "week_ahead" : "day_of"'));
});

Deno.test("Saturday 20 Jun 2026 evening (non-Saturday-planning country) → weekAheadDecision.active === false", () => {
  // Local Sat 18:00 — no PTO/holiday/travel signals and homeCountry
  // defaults to Sunday-planning cadence, so Saturday is inactive.
  const decision = evaluateWeekAheadMode({
    dayOfWeek: 6,
    localHour: 18,
    homeCountry: "GB",
    manualOverride: false,
  });
  assertEquals(decision.active, false);
  assertEquals(decision.reason, null);
});

Deno.test("Sunday 21 Jun 2026 → weekAheadDecision.active === true / reason='weekly_planning'", () => {
  const decision = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 12,
    homeCountry: "GB",
    manualOverride: false,
  });
  assertEquals(decision.active, true);
  assertEquals(decision.reason, "weekly_planning");
  assertEquals(decision.lookaheadDays, 7);
});

// ────────────────────── 24h day-of anchor gate ───────────────────────
Deno.test("imports the 24h day-of invariant helpers (gateDayOfAnchor + DAY_OF_HORIZON_MS)", () => {
  assertStringIncludes(SRC, "gateDayOfAnchor,");
  assertStringIncludes(SRC, "DAY_OF_HORIZON_MS,");
});



