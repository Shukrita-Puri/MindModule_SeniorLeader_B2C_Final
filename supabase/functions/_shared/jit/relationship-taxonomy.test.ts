import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RELATIONSHIP_TAXONOMY } from "./relationship-taxonomy.ts";

Deno.test("relationship taxonomy exposes investor chip and canonical weights", () => {
  assertEquals(RELATIONSHIP_TAXONOMY.investor.weight, 25);
  assertEquals(RELATIONSHIP_TAXONOMY.investor.chip, "Investor");
  assertEquals(RELATIONSHIP_TAXONOMY.skip_level.chip, "Leadership");
  assertEquals(RELATIONSHIP_TAXONOMY.report_direct.chip, "Team");
  assertEquals(RELATIONSHIP_TAXONOMY.report_junior.chip, "Junior");
  assertEquals(RELATIONSHIP_TAXONOMY.board_member.weight, 25);
  assertEquals(RELATIONSHIP_TAXONOMY.vendor.weight, 8);
});
