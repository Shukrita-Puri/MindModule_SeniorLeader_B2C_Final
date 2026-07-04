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
  assert(
    SRC.includes(".from('practice_sessions').select('content_id, completed_at')"),
    "expected generate-mastery-plan to read practice_sessions.content_id",
  );
  assert(
    !SRC.includes(".from('practice_sessions').select('practice_id, completed_at')"),
    "stale practice_sessions.practice_id query should be removed",
  );
});
