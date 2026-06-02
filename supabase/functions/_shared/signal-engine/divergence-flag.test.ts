import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { divergenceProvenance } from "./divergence-flag.ts";

// Source provenance — wearable wins as primary when present; calendar
// next; pattern only when wearable + calendar are both null; refinedBy
// is 'checkin' iff a check-in exists, else null.

Deno.test("divergenceProvenance — wearable + calendar baseline (no check-in)", () => {
  const p = divergenceProvenance({
    physComposite: 62,
    demandScore: 45,
    hasPatternSignal: true,
    hasCeoBehaviour: true,
    hasCheckin: false,
  });
  assertEquals(p.primary, "wearable");
  assertEquals(p.refinedBy, null);
  assertEquals(p.sources, ["wearable", "calendar", "pattern", "ceo-behaviour"]);
});

Deno.test("divergenceProvenance — check-in refines the baseline", () => {
  const p = divergenceProvenance({
    physComposite: 62,
    demandScore: 45,
    hasCheckin: true,
  });
  assertEquals(p.primary, "wearable");
  assertEquals(p.refinedBy, "checkin");
  assertEquals(p.sources.includes("checkin"), true);
});

Deno.test("divergenceProvenance — cold start (only check-in) primary=checkin", () => {
  const p = divergenceProvenance({
    physComposite: null,
    demandScore: null,
    hasCheckin: true,
  });
  assertEquals(p.primary, "checkin");
  assertEquals(p.refinedBy, "checkin");
});

Deno.test("divergenceProvenance — pattern-only fallback", () => {
  const p = divergenceProvenance({
    physComposite: null,
    demandScore: null,
    hasPatternSignal: true,
    hasCheckin: false,
  });
  assertEquals(p.primary, "pattern");
  assertEquals(p.refinedBy, null);
});