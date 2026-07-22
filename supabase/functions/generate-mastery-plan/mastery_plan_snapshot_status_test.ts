import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION = await Deno.readTextFile(
  new URL(
    "../../migrations/20260722133000_allow_awaiting_mastery_plan_snapshots.sql",
    import.meta.url,
  ),
);

Deno.test("mastery_plan_snapshots status check allows awaiting snapshots", () => {
  assertStringIncludes(MIGRATION, "mastery_plan_snapshots_status_chk");
  assertStringIncludes(MIGRATION, "'awaiting'");
});
