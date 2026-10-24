// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Own Action Efficacy Engine (E-L4-5, 7A).
// Handles adoption, feedback, declared exclusions, and unknown efficacy states.
// Source: Part 2 Layer 4 (Section 7A, Scenarios L4-10, L4-11, L4-12).

import type { EfficacyRow, History } from "../types.ts";
import { computeShrunkRate } from "./population.ts";

export interface ComputeOwnActionEfficacyOptions {
  populationUserCount?: number;
  populationRate?: number;
}

export function computeOwnActionEfficacy(
  history: History,
  options: ComputeOwnActionEfficacyOptions = {}
): EfficacyRow[] {
  const popCount = options.populationUserCount ?? 25;
  const popRate = options.populationRate ?? 0.6;

  // Group own actions by actionId + situation
  const groups = new Map<string, typeof history.ownActionRecords>();

  for (const record of history.ownActionRecords) {
    const key = `${record.actionId}__${record.situation || "general"}`;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }

  const results: EfficacyRow[] = [];

  for (const [key, records] of groups.entries()) {
    const [actionId, situation] = key.split("__");
    const offeredCount = records.length;
    const doneCount = records.filter((r) => r.status === "done").length;

    // Filter reviews (useful, neutral, not_relevant_now)
    // Scenario L4-11: "not_relevant_ever" is treated as an exclusion preference, not efficacy failure
    const reviewed = records.filter(
      (r) => r.rating !== undefined && r.rating !== null && r.rating !== "not_relevant_ever"
    );
    const usefulCount = reviewed.filter((r) => r.rating === "useful").length;
    const neutralCount = reviewed.filter((r) => r.rating === "neutral").length;
    const notRelNowCount = reviewed.filter((r) => r.rating === "not_relevant_now").length;
    const notRelEverCount = records.filter((r) => r.rating === "not_relevant_ever").length;

    const adoptionRate = offeredCount > 0 ? doneCount / offeredCount : 0;

    // Scenario L4-12: If never reviewed, efficacy has no data (rate defaults to prior 0.5 without lowering)
    const hasEfficacyData = reviewed.length > 0;
    const observedEfficacy = hasEfficacyData ? usefulCount / reviewed.length : 0.5;

    const shrunkRate = hasEfficacyData
      ? computeShrunkRate({
          observedRate: observedEfficacy,
          sampleN: reviewed.length,
          populationUserCount: popCount,
          populationRate: popRate,
        })
      : 0.5;

    // Scenario L4-10: 4 of 5 useful -> emerging
    const confidence =
      reviewed.length >= 5
        ? "strong"
        : reviewed.length >= 3
        ? "emerging"
        : "insufficient_data";

    results.push({
      interventionId: actionId,
      interventionKind: "own_action",
      bucketKey: situation,
      offeredCount,
      startedCount: doneCount,
      completedCount: doneCount,
      reviewedUsefulCount: usefulCount,
      reviewedNeutralCount: neutralCount,
      reviewedNotRelevantCount: notRelNowCount + notRelEverCount,
      adoptionRate: Math.round(adoptionRate * 100) / 100,
      efficacyRate: Math.round(observedEfficacy * 100) / 100,
      shrunkRate,
      confidence,
    });
  }

  return results;
}
