import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  defaultExecutiveHomeCronConfig,
  mergeExecutiveHomeCronConfig,
  resolveDueWindow,
  validateWindowConfig,
} from "./scheduler.ts";

Deno.test("Kolkata user gets morning run at configured local time", () => {
  const config = defaultExecutiveHomeCronConfig();
  config.dispatcherIntervalMinutes = 5;
  config.configJson.windows.morning = "05:00";

  const now = new Date("2026-07-05T23:32:00.000Z"); // 05:02 Asia/Kolkata on 2026-07-06
  assertEquals(resolveDueWindow("Asia/Kolkata", now, config), "morning");
});

Deno.test("UK user is evaluated in UK local time, not server UTC", () => {
  const config = defaultExecutiveHomeCronConfig();
  config.dispatcherIntervalMinutes = 10;
  config.configJson.windows.morning = "05:00";

  const now = new Date("2026-07-06T04:05:00.000Z"); // 05:05 Europe/London in BST
  assertEquals(resolveDueWindow("Europe/London", now, config), "morning");
  assertEquals(resolveDueWindow("UTC", now, config), null);
});

Deno.test("disabled job does not resolve a due window", () => {
  const config = defaultExecutiveHomeCronConfig();
  config.enabled = false;
  assertEquals(resolveDueWindow("Asia/Kolkata", new Date("2026-07-05T23:32:00.000Z"), config), null);
});

Deno.test("window validation rejects overlaps and bad formats", () => {
  assertEquals(
    validateWindowConfig({ morning: "05:00", afternoon: "04:00", evening: "18:00" }),
    ["Morning, afternoon, and evening must be strictly increasing and non-overlapping."],
  );
  assertEquals(
    validateWindowConfig({ morning: "5:00", afternoon: "12:00", evening: "18:00" }),
    ["Morning time must be HH:mm."],
  );
});

Deno.test("mergeExecutiveHomeCronConfig preserves defaults for partial rows", () => {
  const merged = mergeExecutiveHomeCronConfig({
    enabled: false,
    max_users_per_run: 20,
    config_json: {
      windows: { morning: "06:00" },
    },
  } as any);

  assertEquals(merged.enabled, false);
  assertEquals(merged.maxUsersPerRun, 20);
  assertEquals(merged.configJson.windows.morning, "06:00");
  assertEquals(merged.configJson.windows.afternoon, "12:00");
});
