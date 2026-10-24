// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Practice Efficacy Engine.
// Evaluates completion, feedback ratings, and shrinkage within item buckets.
// Source: Part 2 Layer 4 (Section 7, E1 to E11, Scenario L4-13).

import type { EfficacyRow, History } from "../types.ts";
import { computeShrunkRate } from "./population.ts";

export interface ComputePracticeEfficacyOptions {
  populationUserCount?: number;
  populationRate?: number;
}

export function computePracticeEfficacy(
  history: History,
  options: ComputePracticeEfficacyOptions = {}
): EfficacyRow[] {
  const popCount = options.populationUserCount ?? 25;
  const popRate = options.populationRate ?? 0.6;

  // Group practice sessions by practiceId + bucketKey (Scenario L4-13)
  const groups = new Map<string, typeof history.practiceSessions>();

  for (const session of history.practiceSessions) {
    const bucket = session.anchorCategory ? `cat_${session.anchorCategory.toLowerCase()}` : "general";
    const key = `${session.practiceId}__${bucket}`;
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }

  const results: EfficacyRow[] = [];

  for (const [key, sessions] of groups.entries()) {
    const [practiceId, bucketKey] = key.split("__");
    const offeredCount = sessions.length;
    const completedCount = sessions.filter((s) => s.completed).length;

    const reviewed = sessions.filter((s) => s.rating !== undefined && s.rating !== null);
    const usefulCount = reviewed.filter((s) => s.rating === "useful").length;
    const neutralCount = reviewed.filter((s) => s.rating === "neutral").length;
    const notRelCount = reviewed.filter(
      (s) => s.rating === "not_relevant_now" || s.rating === "not_relevant_ever"
    ).length;

    const adoptionRate = offeredCount > 0 ? completedCount / offeredCount : 0;
    const efficacyRate = reviewed.length > 0 ? usefulCount / reviewed.length : 0.5;

    const shrunkRate = computeShrunkRate({
      observedRate: efficacyRate,
      sampleN: reviewed.length,
      populationUserCount: popCount,
      populationRate: popRate,
    });

    const confidence =
      reviewed.length >= 5
        ? "strong"
        : reviewed.length >= 3
        ? "emerging"
        : "insufficient_data";

    results.push({
      interventionId: practiceId,
      interventionKind: "practice",
      bucketKey,
      offeredCount,
      startedCount: completedCount,
      completedCount,
      reviewedUsefulCount: usefulCount,
      reviewedNeutralCount: neutralCount,
      reviewedNotRelevantCount: notRelCount,
      adoptionRate: Math.round(adoptionRate * 100) / 100,
      efficacyRate: Math.round(efficacyRate * 100) / 100,
      shrunkRate,
      confidence,
    });
  }

  return results;
}
