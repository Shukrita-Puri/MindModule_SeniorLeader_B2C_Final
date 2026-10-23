// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Agreement Domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateAgreement } from "./index.ts";

Deno.test("Agreement - ST-02: Low HRV with high check-in emits bodyMindDivergence (body lower)", () => {
  const result = evaluateAgreement({
    physiologyTier: "managing", // idx 3
    selfReportedTier: "optimal", // idx 0
    physiologyFreshness: "fresh",
  });

  assertEquals(result.hasDivergence, true);
  assertEquals(result.divergence?.direction, "body_lower");
  assertEquals(result.divergence?.tierGapSize, 3);
  assertEquals(result.divergence?.requiresSecondSignal, true);
});

Deno.test("Agreement - Close alignment (gap 1) emits no divergence", () => {
  const result = evaluateAgreement({
    physiologyTier: "steady", // idx 2
    selfReportedTier: "primed", // idx 1
    physiologyFreshness: "fresh",
  });

  assertEquals(result.hasDivergence, false);
  assertEquals(result.divergence, null);
});

Deno.test("Agreement - Missing wearable skips engine gracefully", () => {
  const result = evaluateAgreement({
    physiologyTier: "uncalibrated",
    selfReportedTier: "optimal",
    physiologyFreshness: "missing",
  });

  assertEquals(result.hasDivergence, false);
  assertEquals(result.divergence, null);
  assertEquals(result.skippedReason, "missing_body_data");
});
