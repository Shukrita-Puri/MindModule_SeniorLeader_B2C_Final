// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Rollup sparse subtypes to parent category.
// Source: Part 2 Layer 4 (Section 6, Scenario L4-8).

import { MIN_SUBTYPE_OCCURRENCES_FOR_ROLLUP } from "../constants.ts";
import type { ExposureEvent } from "../types.ts";

/**
 * Checks if an event group should be rolled up to its category parent.
 * Sparse subtypes (n < 3) roll up to parent category.
 */
export function groupExposuresWithRollup(
  exposures: ExposureEvent[]
): Map<string, ExposureEvent[]> {
  const groups = new Map<string, ExposureEvent[]>();

  // 1. Group by raw bucketKey
  for (const exp of exposures) {
    const list = groups.get(exp.bucketKey) ?? [];
    list.push(exp);
    groups.set(exp.bucketKey, list);
  }

  // 2. Identify sparse subtype groups (e.g. "D:interview" with < 3 items)
  // and fold them into the parent category ("D")
  const rolledUpGroups = new Map<string, ExposureEvent[]>();

  for (const [key, items] of groups.entries()) {
    if (key.includes(":") && items.length < MIN_SUBTYPE_OCCURRENCES_FOR_ROLLUP) {
      const parentCategory = key.split(":")[0];
      const parentList = rolledUpGroups.get(parentCategory) ?? [];
      parentList.push(...items);
      rolledUpGroups.set(parentCategory, parentList);
    } else {
      const existing = rolledUpGroups.get(key) ?? [];
      existing.push(...items);
      rolledUpGroups.set(key, existing);
    }
  }

  return rolledUpGroups;
}
