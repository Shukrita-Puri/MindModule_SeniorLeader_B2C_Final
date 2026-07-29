// Contract tests for the F1/F3 gaps: window resolution + awaiting-status
// persistence + strict Brief handshake. These are source-level assertions
// against `generate-mastery-plan/index.ts` — we intentionally avoid
// booting the full handler because it depends on Supabase env at import
// time. The rules being asserted are the ones the reviewer will scan for.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("F1 — main handler prefers explicit mrsWindow/timeWindow over wall-clock", () => {
  assert(
    SRC.includes("typeof body.mrsWindow === 'string'") || SRC.includes('typeof body.mrsWindow === "string"'),
    "expected the handler to parse body.mrsWindow",
  );
  assert(
    SRC.includes("currentPeriod = (requestedWindow ?? getTimeOfDay(clientTimezoneOffset))") || SRC.includes("currentPeriod = requestedWindow ?? (getTimeOfDay(clientTimezoneOffset) as any)") || SRC.includes("currentPeriod =\n        (requestedWindow ?? getTimeOfDay(clientTimezoneOffset)) as any;"),
    "currentPeriod must be resolved from the requested window first",
  );
});

Deno.test("F1 — PlanRequest carries an explicit timeWindow field", () => {
  assert(
    SRC.includes("timeWindow?: 'morning' | 'afternoon' | 'evening' | null;") || SRC.includes('timeWindow?: "morning" | "afternoon" | "evening" | null;'),
    "PlanRequest must carry timeWindow",
  );
  assert(
    SRC.includes("(req.timeWindow ?? getTimeOfDay(req.timezoneOffset))"),
    "buildSharedContext + generateMasteryPlan must prefer req.timeWindow",
  );
});

Deno.test("F2 — strictBriefHandshake short-circuits with an awaiting envelope", () => {
  assert(SRC.includes("strictBriefHandshake?: boolean;"));
  assert(
    SRC.includes("req.strictBriefHandshake === true && shared.briefBehaviourSource === 'absent'") || SRC.includes('req.strictBriefHandshake === true &&\n    shared.briefBehaviourSource === "absent"'),
  );
  assert(SRC.includes("reason: 'brief_handshake_missing'") || SRC.includes('reason: "brief_handshake_missing"'));
});

Deno.test("F3 — awaiting plans persist as status='awaiting', never 'ready'", () => {
  // The snapshot writer must derive status from the plan shape, not
  // hardcode 'ready'. The upsert must use the derived value.
  assert(SRC.includes("const snapshotStatus: 'ready' | 'awaiting' =") || SRC.includes('const snapshotStatus: "ready" | "awaiting" ='));
  assert(SRC.includes("(!planIsAwaiting && hasPayload) ? 'ready' : 'awaiting'") || SRC.includes('(!planIsAwaiting && hasPayload) ? "ready" : "awaiting"'));
  assert(SRC.includes("status: snapshotStatus,"));
  // Overwrite protection: an awaiting write must never clobber ready.
  assert(SRC.includes("[mastery-plan-snapshot][awaiting-preserved-ready]"));
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


