import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generatePlanBrief } from "./index.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("generatePlanBrief stays neutral when readiness is awaiting", () => {
  const calendarContext = {
    todayLoad: "light" as const,
    todayMeetingCount: 0,
    todayMeetingHours: 0,
    upcomingLoad: "light" as const,
    upcomingMeetingCount: 0,
    upcomingMeetingHours: 0,
    remainingMeetingCount: 0,
  };

  const brief = generatePlanBrief(
    calendarContext,
    "morning",
    "managing",
    null,
    "",
    "light",
    {
      sleepScore: null,
      hrvMs: null,
      restingHR: null,
      hrvDeviation: null,
      sleepQuality: null,
      hasData: false,
    },
    "",
    "",
    "",
    [],
    [],
    [],
    null,
    null,
    [],
    [],
  );

  assertStringIncludes(brief, "Readiness signals are still coming in");
});

Deno.test("generate-mastery-plan reads canonical practice_sessions.content_id", () => {
  const staleSelect = ".from('practice_sessions').select('practice" + "_id, completed_at')";
  assert(
    SRC.includes(".from('practice_sessions').select('content_id, completed_at')") || SRC.includes('.from("practice_sessions").select("content_id, completed_at")'),
    "expected generate-mastery-plan to read practice_sessions.content_id",
  );
  assert(
    !SRC.includes(staleSelect),
    "stale practice session select should be removed",
  );
});

// v2026-09-07 (R1): the snapshot must persist a real day type. The plan object
// only ever writes meta.dayShape; sourcing meta.dayKind alone always saved null.
Deno.test("plan snapshot saves day_kind from meta.dayShape", () => {
  assert(
    /day_kind: planObj\?\.meta\?\.dayShape/.test(SRC),
    "mastery_plan_snapshots.day_kind must source planObj.meta.dayShape first",
  );
  assert(
    /dayShape: allocation\.dayShape/.test(SRC),
    "plan meta must still carry dayShape",
  );
});

// v2026-09-07 (R6): the JIT v2 prioritisation is persisted, and each run
// replaces the previous run's rows so the table stays current-truth sized.
Deno.test("JIT v2 selection is persisted and replaces the previous run", () => {
  assert(
    /await persistJitV2Selection\(supabaseClient, req\.userId, preferredSelectResult\)/
      .test(SRC),
    "plan generation must persist the JIT v2 selection",
  );
  assert(
    /\.from\("jit_carousel_cards"\)\s*\n?\s*\.delete\(\)/.test(SRC),
    "each run must delete the user's previous JIT v2 rows before inserting",
  );
  assert(
    /score_breakdown: c\?\.components/.test(SRC) && /selection_slot: dominantSlot\(c\)/.test(SRC),
    "persisted rows must carry the score breakdown and chosen slot",
  );
});
