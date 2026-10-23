// [KIND: test] [LAYER: 0] [TIERS: 3] [AUDIENCE: universal]
// Unit tests for Layer 0 Profile domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateForCompletion,
  resolveArchetypeSlug,
  buildDeclaredProfile,
  type V8Payload,
} from "./index.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "onboarding_v8",
  version: "8.0.0",
  traceId: "test_profile_trace",
};

Deno.test("Profile Domain: Onboarding validation and declared profile", () => {
  const payload: V8Payload = {
    goals: ["scale_revenue", "build_leadership_team"],
    stakes_chips: ["Board accountability", "Public scrutiny"],
    load_chips: ["Frequent context switching"],
    burden_chips: ["Decision fatigue"],
    brief_timing: "Morning",
    preferred_practice_window: "Morning",
    reset_modality: "Mindset",
    weekend_signals: "Reduce",
    home_country: "GB",
    calendar_selections: ["google"],
    wearable_selections: ["apple-watch"],
  };

  const errors = validateForCompletion(payload);
  assertEquals(errors.length, 0, "Valid payload should pass validation");

  const declared = buildDeclaredProfile({
    userId: "user_sarah",
    payload,
    provenance: mockProvenance,
  });

  assertEquals(declared.userId, "user_sarah");
  assertEquals(declared.intentions.goals.length, 2);
  assertEquals(declared.preferences.weekend, "reduce");
  assertEquals(declared.inferred.confirmed, false, "Synthesized/inferred context starts unconfirmed");
});

Deno.test("Profile Domain: Archetype slug resolution", () => {
  const archetype = resolveArchetypeSlug("builder");
  assertEquals(archetype, "awareness-builder");
  assertEquals(resolveArchetypeSlug("grounded-leader"), "grounded-leader");
});
