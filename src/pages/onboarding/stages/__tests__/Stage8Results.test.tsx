import { describe, it } from "vitest";

/**
 * Quarantined: legacy Stage8Results is no longer part of the V8 onboarding
 * runtime. The `/onboarding/results` route now redirects to
 * `/onboarding/app-intro` (see src/App.tsx) and the Stage8Results component
 * is retained only as dead code pending Phase-6 legacy removal.
 *
 * The historical assertions here targeted copy and layout that only exist in
 * the legacy flow, so they no longer reflect the active runtime path. This
 * suite is intentionally skipped rather than deleted, so the file can be
 * removed together with the rest of the legacy questionnaire in Phase 6.
 */
describe.skip("Stage8Results (legacy — quarantined for V8-only runtime)", () => {
  it("legacy component — see file header", () => {});
});
