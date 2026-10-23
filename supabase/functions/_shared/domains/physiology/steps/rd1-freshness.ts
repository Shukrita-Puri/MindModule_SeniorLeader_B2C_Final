// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step RD1: Biometric Freshness Evaluation.
// Source: Part 2 Layer 2 (Section 5.1.1, RD1).

import type { RawBiometrics } from "../types.ts";
import { WEARABLE_STALE_HOURS } from "../constants.ts";

export function stepEvaluateFreshness(
  raw: RawBiometrics,
  nowUtc: Date = new Date(),
): "fresh" | "stale" | "missing" {
  if (!raw.readingTimestampUtc && raw.hrvMs === null && raw.restingHrBpm === null && raw.sleepMinutes === null) {
    return "missing";
  }

  if (!raw.readingTimestampUtc) {
    return "fresh"; // Timestamp omitted in mock/test
  }

  const readingMs = new Date(raw.readingTimestampUtc).getTime();
  const diffHours = (nowUtc.getTime() - readingMs) / (1000 * 60 * 60);

  if (diffHours < 0 || diffHours <= WEARABLE_STALE_HOURS) {
    return "fresh";
  }

  return "stale";
}
