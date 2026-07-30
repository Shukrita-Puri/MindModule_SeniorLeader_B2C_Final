import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const MIGRATION = await Deno.readTextFile(
  new URL("../../migrations/20260730101500_add_event_subcategory_to_causality_findings.sql", import.meta.url),
);

Deno.test("cause-effect-engine persists top event_subcategory to causality_findings", () => {
  assertStringIncludes(SRC, "const topEventSubcategory =");
  assertStringIncludes(SRC, "event_subcategory: topEventSubcategory");
});

Deno.test("causality_findings schema includes event_subcategory", () => {
  assertStringIncludes(MIGRATION, "ADD COLUMN IF NOT EXISTS event_subcategory text");
});
