import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generatePlanBrief } from "./index.ts";

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
