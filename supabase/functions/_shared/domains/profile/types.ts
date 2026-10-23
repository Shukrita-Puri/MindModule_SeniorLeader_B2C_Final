// [KIND: specification] [LAYER: 0] [TIERS: 3] [AUDIENCE: universal]
// Domain types for Layer 0 Profile.
// Source: Part 2 Layer 0 (Section 6, 12.1).

import type { Provenance } from "../../spine/types.ts";
export type { StepKey, ValidationError, V8Payload } from "./validation.ts";
export type { CanonicalArchetype } from "./archetype.ts";

export interface DeclaredProfile {
  schemaVersion: 1;
  userId: string;
  facts: {
    homeCountry: string | null;
    homeRegion: string | null;
  };
  priors: {
    stakes: string[];
    burdens: string[];
  };
  intentions: {
    goals: string[];
    pressures: string[];
  };
  preferences: {
    briefTiming: string | null;
    practiceWindow: string | null;
    resetModality: string | null;
    weekend: "reduce" | "keep" | null;
  };
  inferred: {
    companyContext?: unknown;
    voice?: unknown;
    confirmed: boolean;
  };
  provenance: Provenance;
}
