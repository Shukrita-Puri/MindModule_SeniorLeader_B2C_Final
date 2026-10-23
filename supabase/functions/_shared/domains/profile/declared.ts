// [KIND: implementation] [LAYER: 0] [TIERS: 3] [AUDIENCE: universal]
// Declared Profile Builder from Onboarding Responses.
// Source: Part 2 Layer 0 (Section 6, 12.1).

import type { DeclaredProfile, V8Payload } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";

/**
 * Transforms validated onboarding v8 responses into the canonical DeclaredProfile shape.
 */
export function buildDeclaredProfile(input: {
  userId: string;
  payload: V8Payload;
  inferredContext?: { companyContext?: unknown; voice?: unknown };
  provenance: Provenance;
}): DeclaredProfile {
  const { userId, payload, inferredContext, provenance } = input;

  return {
    schemaVersion: 1,
    userId,
    facts: {
      homeCountry: payload.home_country ?? null,
      homeRegion: null,
    },
    priors: {
      stakes: payload.stakes_chips ?? [],
      burdens: payload.burden_chips ?? [],
    },
    intentions: {
      goals: payload.goals ?? [],
      pressures: payload.load_chips ?? [],
    },
    preferences: {
      briefTiming: payload.brief_timing ?? null,
      practiceWindow: payload.preferred_practice_window ?? null,
      resetModality: payload.reset_modality ?? null,
      weekend: payload.weekend_signals === "Reduce" ? "reduce" : payload.weekend_signals === "Keep" ? "keep" : null,
    },
    inferred: {
      companyContext: inferredContext?.companyContext ?? undefined,
      voice: inferredContext?.voice ?? undefined,
      confirmed: false, // Inferred company context/voice is unconfirmed until explicit confirmation (Spine 9.2)
    },
    provenance,
  };
}
