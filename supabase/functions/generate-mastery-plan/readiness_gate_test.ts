import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("readiness gate fails closed when no current-window MRS snapshot exists", () => {
  // A missing snapshot must count as awaiting unless the request carries a
  // usable readiness score — otherwise the Plan can publish while the MRS
  // card still renders its awaiting state.
  assertStringIncludes(SRC, "const noReadinessEvidence = snapshotMrsAwaiting === null &&");
  assertStringIncludes(SRC, "!hasRequestReadinessScore && !hasCacheReadinessScore");
  assertStringIncludes(
    SRC,
    "const mrsCardsAwaiting = snapshotMrsAwaiting === true || requestMrsAwaiting ||",
  );
  assertStringIncludes(SRC, "noReadinessEvidence;");
});

Deno.test("plan generation stays gated on a non-awaiting MRS", () => {
  assertStringIncludes(
    SRC,
    "const canGeneratePlan = hasStage1Signal && !mrsCardsAwaiting;",
  );
});
