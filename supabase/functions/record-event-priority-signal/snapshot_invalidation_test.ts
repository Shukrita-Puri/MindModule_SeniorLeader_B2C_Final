import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("permanent never invalidates current and future weekly snapshots", () => {
  assertStringIncludes(SRC, "localWeekOf(new Date(), timezoneIn).start");
  assertStringIncludes(SRC, "const currentWeekStart");

  const staleWeeklyDelete =
    /from\("weekly_plan_snapshots"\)[\s\S]*?gte\("week_start_date", todayISO\)/;
  assertEquals(
    staleWeeklyDelete.test(SRC),
    false,
    "weekly snapshots are keyed by week_start_date, so todayISO misses the current week after Monday",
  );

  const currentWeekDelete =
    /from\("weekly_plan_snapshots"\)[\s\S]*?gte\("week_start_date", currentWeekStart\)/;
  assertEquals(currentWeekDelete.test(SRC), true);
});
