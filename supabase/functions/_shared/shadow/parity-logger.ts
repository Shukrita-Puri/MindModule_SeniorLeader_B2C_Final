// [KIND: infrastructure] [LAYER: shadow] [TIERS: 0] [AUDIENCE: universal]
// Shadow Parity Logger.
// Source: Spine Section 12, Decision 27.
// Invariant: Structured JSON only; hashed IDs; zero titles, locations, names, or personal content.

import type { DifferenceSeverity } from "./difference-classifier.ts";

export interface ShadowLogEntry {
  traceId: string;
  surface: string;
  hashedUserId: string;
  hashedItemId: string;
  legacyCategory: string | null;
  shadowCategory: string;
  confidence: number;
  differenceSeverity: DifferenceSeverity;
  reasonCode: string;
  durationMs: number;
  timestampUtc: string;
}

export function hashIdentifier(rawId: string): string {
  // Simple deterministic non-reversible prefix hash for telemetry
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    hash = ((hash << 5) - hash + rawId.charCodeAt(i)) | 0;
  }
  return "hash_" + Math.abs(hash).toString(16).padStart(8, "0");
}

export function logShadowComparison(entry: Omit<ShadowLogEntry, "timestampUtc">): void {
  const payload: ShadowLogEntry = {
    ...entry,
    timestampUtc: new Date().toISOString(),
  };

  // Telemetry emission (safe for production logs, zero PII)
  console.log(`[SHADOW_PARITY_AUDIT] ${JSON.stringify(payload)}`);
}
