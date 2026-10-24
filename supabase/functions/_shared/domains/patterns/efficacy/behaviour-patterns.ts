// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Behaviour Patterns Engine.
// Detects situational skip and adoption patterns (e.g. skipping evening close on travel days).
// Source: Part 2 Layer 4 (Section 7A, Scenario L4-14, Layer 4 Cross-Layer additions).

import type { ConfidenceTier, History } from "../types.ts";

export interface SituationalBehaviourPattern {
  interventionId?: string;
  situation: string; // e.g. "travel", "category_a"
  situationOfferedCount: number;
  situationSkippedCount: number;
  situationSkipRatePct: number;
  baselineSkipRatePct: number;
  isReliablySkipped: boolean;
  confidence: ConfidenceTier;
  reason: string;
}

/**
 * Computes behavioural skip patterns across situations (Scenario L4-14).
 * Feeds Layer 3 routing input (Layer 4 Cross-Layer additions).
 */
export function computeBehaviourPatterns(
  history: History
): SituationalBehaviourPattern[] {
  const patterns: SituationalBehaviourPattern[] = [];

  // Group practice records by situation (e.g. "travel" vs general)
  const situationMap = new Map<
    string,
    { offered: number; skipped: number; interventionId?: string }
  >();

  for (const session of history.practiceSessions) {
    // Check if session occurred on a travel day or specific anchor
    const day = history.days.find((d) => d.date === session.date);
    const isTravel = day?.dayProfile?.travel?.isTravelling ?? false;
    const situation = isTravel ? "travel" : session.anchorCategory ? `category_${session.anchorCategory.toLowerCase()}` : "normal";

    const entry = situationMap.get(situation) ?? {
      offered: 0,
      skipped: 0,
      interventionId: session.practiceId,
    };
    entry.offered++;
    if (!session.completed) {
      entry.skipped++;
    }
    situationMap.set(situation, entry);
  }

  // Calculate baseline skip rate across all normal sessions
  const normal = situationMap.get("normal") ?? { offered: 1, skipped: 0 };
  const baselineSkipRate = (normal.skipped / normal.offered) * 100;

  for (const [sit, data] of situationMap.entries()) {
    if (sit === "normal" || data.offered < 3) continue;

    const skipRatePct = Math.round((data.skipped / data.offered) * 100);
    // Reliably skipped if skip rate >= 70% and at least 3 occurrences
    const isReliablySkipped = skipRatePct >= 70 && data.offered >= 3;

    if (isReliablySkipped) {
      const confidence: ConfidenceTier = data.offered >= 5 ? "strong" : "emerging";
      patterns.push({
        interventionId: data.interventionId,
        situation: sit,
        situationOfferedCount: data.offered,
        situationSkippedCount: data.skipped,
        situationSkipRatePct: skipRatePct,
        baselineSkipRatePct: Math.round(baselineSkipRate),
        isReliablySkipped: true,
        confidence,
        reason: `Practice skipped ${data.skipped} of ${data.offered} times in ${sit} (${skipRatePct}% skip rate vs ${Math.round(baselineSkipRate)}% baseline)`,
      });
    }
  }

  return patterns;
}
