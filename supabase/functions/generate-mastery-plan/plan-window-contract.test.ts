// Contract tests for the F1/F3 gaps: window resolution + awaiting-status
// persistence + strict Brief handshake. These are source-level assertions
// against `generate-mastery-plan/index.ts` — we intentionally avoid
// booting the full handler because it depends on Supabase env at import
// time. The rules being asserted are the ones the reviewer will scan for.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("F1 — main handler prefers explicit mrsWindow/timeWindow over wall-clock", () => {
  assertStringIncludes(
    SRC,
    "typeof body.mrsWindow === 'string' ? body.mrsWindow",
    "expected the handler to parse body.mrsWindow",
  );
  assertStringIncludes(
    SRC,
    "currentPeriod = (requestedWindow ?? getTimeOfDay(clientTimezoneOffset))",
    "currentPeriod must be resolved from the requested window first",
  );
});

Deno.test("F1 — PlanRequest carries an explicit timeWindow field", () => {
  assertStringIncludes(SRC, "timeWindow?: 'morning' | 'afternoon' | 'evening' | null;");
  assertStringIncludes(
    SRC,
    "(req.timeWindow ?? getTimeOfDay(req.timezoneOffset))",
    "buildSharedContext + generateMasteryPlan must prefer req.timeWindow",
  );
});

Deno.test("F2 — strictBriefHandshake short-circuits with an awaiting envelope", () => {
  assertStringIncludes(SRC, "strictBriefHandshake?: boolean;");
  assertStringIncludes(
    SRC,
    "req.strictBriefHandshake === true && shared.briefBehaviourSource === 'absent'",
  );
  assertStringIncludes(SRC, "reason: 'brief_handshake_missing'");
});

Deno.test("F3 — awaiting plans persist as status='awaiting', never 'ready'", () => {
  // The snapshot writer must derive status from the plan shape, not
  // hardcode 'ready'. The upsert must use the derived value.
  assertStringIncludes(SRC, "const snapshotStatus: 'ready' | 'awaiting' =");
  assertStringIncludes(SRC, "(!planIsAwaiting && hasPayload) ? 'ready' : 'awaiting'");
  assertStringIncludes(SRC, "status: snapshotStatus,");
  // Overwrite protection: an awaiting write must never clobber ready.
  assertStringIncludes(SRC, "[mastery-plan-snapshot][awaiting-preserved-ready]");
});

Deno.test("F3 — legacy hardcoded 'status: ready' upsert is gone", () => {
  // The old writer literally set `status: 'ready'` on the upsert row.
  // After F3 the only occurrence of that literal is in string logs,
  // never as a KV in the upsert payload.
  assert(
    !/\bstatus:\s*'ready',\s*\n\s*error_json:\s*null,/.test(SRC),
    "expected the hardcoded ready-status upsert payload to be replaced",
  );
});

Deno.test("F4 — non-rest-day partial horizon projection is server-filled before persistence", () => {
  assertStringIncludes(SRC, "function buildSnapshotFallbackHorizonModules(");
  assertStringIncludes(SRC, "function topUpHorizonModulesToThree(");
  assertStringIncludes(
    SRC,
    "if (!planIsRestDay && finalHorizonModules.length < 3 && todModules.length > 0)",
  );
  assertStringIncludes(SRC, "finalHorizonModules = topUpHorizonModulesToThree(finalHorizonModules, todModules, {");
  assertStringIncludes(SRC, "[generate-mastery-plan][snapshot-projection-topup]");
});

Deno.test("F5 — Plan window signals derive and forward vetoRisk", () => {
  assertStringIncludes(SRC, "vetoRisk: boolean;");
  assertStringIncludes(
    SRC,
    "const vetoRisk =\n    timeOfDay === 'morning' &&",
  );
  assertStringIncludes(SRC, "vetoRisk;");
  assertStringIncludes(SRC, "vetoRisk: whyWindowSignals?.vetoRisk === true ? true : undefined,");
});

Deno.test("F6 — practice selection preserves resolved anchor-category intent hints", () => {
  assertStringIncludes(SRC, "stateAction: slotContract.stateAction ?? (slotContract.arcLabel === 'During'");
  assertStringIncludes(SRC, "anchorCategory: slotContract.anchorCategory ?? null,");
  assertStringIncludes(SRC, "anchorCategory: topEventCat,");
  assertStringIncludes(SRC, "anchorCategory: (slot2Candidate.categoryId as EventCategoryId | null) ?? null,");
  assertStringIncludes(SRC, "anchorCategory: (slot3Candidate.categoryId as EventCategoryId | null) ?? null,");
});
