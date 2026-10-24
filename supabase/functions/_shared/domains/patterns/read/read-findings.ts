// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Read Surface for Layer 4 Findings (E-L4-10, 9A).
// Source: Part 2 Layer 4 (Section 9A, 12.1).

import { FINDING_FRESHNESS_MAX_HOURS } from "../constants.ts";
import type { Finding } from "../types.ts";

export interface ReadFindingsOptions {
  includeShadow?: boolean;
  minConfidence?: "emerging" | "strong";
  maxAgeHours?: number;
}

/**
 * Reads and filters findings for consumers (Brief, Nudges, Insights, Selector).
 * Checks freshness against the 36-hour window (N-L4-1, Scenario L4-9).
 */
export function readFindings(
  findings: Finding[],
  options: ReadFindingsOptions = {}
): Finding[] {
  const includeShadow = options.includeShadow ?? true;
  const minConfidence = options.minConfidence ?? "emerging";
  const maxAgeHours = options.maxAgeHours ?? FINDING_FRESHNESS_MAX_HOURS;
  const now = Date.now();

  return findings.filter((f) => {
    // 1. Shadow filtering
    if (!includeShadow && f.patternKind.startsWith("shadow:")) {
      return false;
    }

    // 2. Confidence filtering
    if (minConfidence === "strong" && f.confidence !== "strong") {
      return false;
    }
    if (f.confidence === "insufficient_data") {
      return false;
    }

    // 3. Freshness check (Scenario L4-9: stale findings discarded)
    const computedAtMs = new Date(f.provenance.computedAt).getTime();
    const ageHours = (now - computedAtMs) / (1000 * 60 * 60);
    if (ageHours > maxAgeHours) {
      return false;
    }

    return true;
  });
}

/**
 * Returns only citable findings approved by the Layer 5 Gate.
 */
export function getCitableFindings(findings: Finding[]): Finding[] {
  return readFindings(findings, { minConfidence: "emerging" });
}
