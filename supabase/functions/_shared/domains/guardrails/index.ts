// [KIND: barrel] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Public entry point for Layer 5 Guardrails Domain.
// Enforces hard stops, pacing, shape, and privacy before delivery.
// Source: Part 2 Layer 5 (Section 5).

export * from "./constants.ts";
export * from "./types.ts";
export { evaluateGuardrails } from "./engine.ts";
