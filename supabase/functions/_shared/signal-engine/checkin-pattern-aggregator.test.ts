import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertPillCoherence } from "./checkin-pattern-aggregator.ts";

Deno.test("assertPillCoherence — inSync when MRS and pills agree", () => {
  const r = assertPillCoherence("balanced", [
    { key: "decision_readiness", tier: "green" },
    { key: "physical_reserves", tier: "green" },
    { key: "resilience_capacity", tier: "amber" },
  ]);
  assertEquals(r.inSync, true);
  assertEquals(r.adjustments.length, 0);
  assertEquals(r.warning, null);
});

Deno.test("assertPillCoherence — MRS depleted with no RED escalates weakest amber", () => {
  const r = assertPillCoherence("depleted", [
    { key: "decision_readiness", tier: "green" },
    { key: "physical_reserves", tier: "amber" },
    { key: "resilience_capacity", tier: "amber" },
  ]);
  assertEquals(r.inSync, false);
  assertEquals(r.adjustments.length, 1);
  assertEquals(r.adjustments[0].to, "red");
  assertEquals(r.adjustments[0].reason, "mrs_depleted_no_red");
  // Pills mutated in returned copy.
  const reds = r.pills.filter((p) => p.tier === "red");
  assertEquals(reds.length, 1);
});

Deno.test("assertPillCoherence — MRS optimal with RED pills downgrades them", () => {
  const r = assertPillCoherence("optimal", [
    { key: "decision_readiness", tier: "red" },
    { key: "physical_reserves", tier: "green" },
    { key: "resilience_capacity", tier: "red" },
  ]);
  assertEquals(r.inSync, false);
  assertEquals(r.adjustments.length, 2);
  for (const a of r.adjustments) {
    assertEquals(a.from, "red");
    assertEquals(a.to, "amber");
    assertEquals(a.reason, "mrs_optimal_with_red");
  }
});

Deno.test("assertPillCoherence — empty pills array returns inSync", () => {
  const r = assertPillCoherence("depleted", []);
  assertEquals(r.inSync, true);
  assertEquals(r.adjustments.length, 0);
});