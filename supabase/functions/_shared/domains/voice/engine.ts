// [KIND: engine] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Voice Contract Engine (VOC).
// Single server-side copy validator and prompt composer for all surfaces.
// Source: Part 2 Layer 5 (Section 6.8, 6.9, 11.2).

import { buildChiefOfStaffPersonaPrompt } from "./profiles/chief-of-staff.ts";
import { checkStructure } from "./steps/step-v1-structure.ts";
import { checkVocabulary } from "./steps/step-v2-vocabulary.ts";
import { checkLength, countWords } from "./steps/step-v3-length.ts";
import { checkTruth } from "./steps/step-v4-truth.ts";
import { checkSafety } from "./steps/step-v5-safety.ts";
import { sanitizeCopy } from "./steps/step-v6-hygiene.ts";
import type {
  CopyCheckResult,
  CopyCheckViolation,
  SurfaceContract,
  WriteRequest,
} from "./types.ts";

/**
 * Universal copy validator for Mind Module.
 * Validates text across all 6 validation steps:
 * V1 (Structure), V2 (Vocabulary), V3 (Length), V4 (Truth), V5 (Safety), V6 (Hygiene).
 */
export function validateCopy(
  text: string,
  contract: SurfaceContract,
  claimSet?: string[],
): CopyCheckResult {
  const sanitized = sanitizeCopy(text);
  const wordCount = countWords(sanitized);
  const characterCount = sanitized.length;

  const violations: CopyCheckViolation[] = [];

  // V1 · Structure
  violations.push(...checkStructure(sanitized, contract));

  // V2 · Vocabulary
  violations.push(...checkVocabulary(sanitized, contract));

  // V3 · Length
  violations.push(...checkLength(sanitized, contract));

  // V4 · Truth & Claim Set
  violations.push(...checkTruth(sanitized, contract, claimSet));

  // V5 · Safety & Privacy
  violations.push(...checkSafety(sanitized, contract));

  return {
    valid: violations.length === 0,
    violations,
    sanitizedText: sanitized,
    wordCount,
    characterCount,
  };
}

/**
 * Extracts key claims from a Brief text to prevent downstream surfaces from duplicating claims.
 */
export function buildBriefClaimSet(briefText: string): string[] {
  if (!briefText) return [];
  // Split into sentences and extract short distinct factual clauses
  return briefText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * Generated prompt blocks for model writing tasks (Section 6.9).
 * Guarantees prompt contracts never drift from runtime validators.
 */
export function buildPromptBlocks(request: WriteRequest): string {
  const blocks: string[] = [];

  // 1. Persona Block
  blocks.push(buildChiefOfStaffPersonaPrompt());

  // 2. Surface Contract Block
  blocks.push(`\n=== SURFACE CONTRACT: ${request.surface.toUpperCase()} ===`);
  blocks.push(`Stance: ${request.stance.toUpperCase()}`);
  if (request.claimSet && request.claimSet.length > 0) {
    blocks.push("Existing claims (do not repeat directly):");
    request.claimSet.forEach((c) => blocks.push(`- ${c}`));
  }

  // 3. Leader Voice Block
  if (request.leaderVoice) {
    blocks.push("\n=== LEADER PREFERENCES ===");
    if (request.leaderVoice.what_lands?.length) {
      blocks.push(`What lands: ${request.leaderVoice.what_lands.join(", ")}`);
    }
    if (request.leaderVoice.what_wont_land?.length) {
      blocks.push(`What won't land: ${request.leaderVoice.what_wont_land.join(", ")}`);
    }
  }

  // 4. Evidence Block
  if (request.evidence && request.evidence.length > 0) {
    blocks.push("\n=== EVIDENCE ===");
    request.evidence.forEach((ev) => {
      blocks.push(`- [${ev.kind.toUpperCase()}] ${ev.fact}: ${ev.value ?? ""} ${ev.unit ?? ""}`);
    });
  }

  return blocks.join("\n");
}
