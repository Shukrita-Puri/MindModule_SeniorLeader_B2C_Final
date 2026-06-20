import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeCustomTag } from "./custom-tag-router.ts";

Deno.test("routes importance synonyms", () => {
  assertEquals(routeCustomTag("vip"), { kind: "importance", value: "high" });
  assertEquals(routeCustomTag("priority"), { kind: "importance", value: "medium" });
  assertEquals(routeCustomTag("optional"), { kind: "importance", value: "low" });
  assertEquals(routeCustomTag("noise"), { kind: "importance", value: "low" });
});

Deno.test("routes relationship synonyms", () => {
  assertEquals(routeCustomTag("mentor"), { kind: "relationship", value: "skip_level" });
  assertEquals(routeCustomTag("cofounder"), { kind: "relationship", value: "board_member" });
  assertEquals(routeCustomTag("vc"), { kind: "relationship", value: "investor" });
  assertEquals(routeCustomTag("reporter"), { kind: "relationship", value: "journalist_media" });
  assertEquals(routeCustomTag("auditor"), { kind: "relationship", value: "regulator" });
  assertEquals(routeCustomTag("acquirer"), { kind: "relationship", value: "acquirer_target" });
  assertEquals(routeCustomTag("partner"), { kind: "relationship", value: "external_partner" });
  assertEquals(routeCustomTag("candidate"), { kind: "relationship", value: "report_direct" });
});

Deno.test("keeps unknown safe text as custom", () => {
  const r = routeCustomTag("follow-up");
  assert(r?.kind === "custom");
});

Deno.test("rejects junk tags", () => {
  assertEquals(routeCustomTag("https://example.com"), null);
  assertEquals(routeCustomTag("😀😀"), null);
  assertEquals(routeCustomTag("x".repeat(41)), null);
});
