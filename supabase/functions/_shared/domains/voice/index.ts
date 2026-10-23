// [KIND: barrel] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Public entry point for Layer 5 Voice Domain.
// Enforces copy validation, Chief of Staff persona, and action contracts.
// Source: Part 2 Layer 5 (Section 6, 11).

export * from "./constants.ts";
export * from "./types.ts";
export * from "./actions.ts";
export {
  CHIEF_OF_STAFF_PERSONA,
  CHIEF_OF_STAFF_SOUNDS_LIKE,
  CHIEF_OF_STAFF_NEVER_SOUNDS_LIKE,
  CHIEF_OF_STAFF_TRAITS,
  buildChiefOfStaffPersonaPrompt,
} from "./profiles/chief-of-staff.ts";
export {
  validateCopy,
  buildBriefClaimSet,
  buildPromptBlocks,
} from "./engine.ts";
