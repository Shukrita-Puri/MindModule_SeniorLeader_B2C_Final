// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step MX4 & MX5: Predominant Category/Subtype and Mixed Days.
// Source: Part 2 Layer 2 (Section 4.6, MX4, MX5).

import type { PredominantFact, MixedFact } from "../types.ts";
import type { SequencedMeeting } from "./mx1-sequence.ts";
import {
  PREDOMINANT_MAJORITY,
  PREDOMINANT_MIN_MEETINGS,
  MIXED_MIN_CATEGORIES,
} from "../constants.ts";

const CATEGORY_NAMES: Record<string, string> = {
  A: "board",
  B: "pitches",
  C: "speaking",
  D: "people",
  E: "strategy",
  F: "conference",
  G: "travel",
  H: "personal",
  I: "operations",
  J: "crisis",
};

export function stepPredominantAndMixed(meetings: SequencedMeeting[]): {
  predominant: PredominantFact | null;
  mixed: MixedFact | null;
  categoryCounts: Record<string, number>;
  subtypeCounts: Record<string, number>;
} {
  const total = meetings.length;
  const categoryCounts: Record<string, number> = {};
  const subtypeCounts: Record<string, number> = {};

  for (const m of meetings) {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    if (m.subtype) {
      subtypeCounts[m.subtype] = (subtypeCounts[m.subtype] || 0) + 1;
    }
  }

  if (total < 2) {
    return {
      predominant: null,
      mixed: null,
      categoryCounts,
      subtypeCounts,
    };
  }

  // 1. Check Subtype Predominance first (e.g. "gov.budget_review" -> budget day)
  for (const [subId, count] of Object.entries(subtypeCounts)) {
    const share = count / total;
    if (share > PREDOMINANT_MAJORITY && count >= PREDOMINANT_MIN_MEETINGS) {
      const cleanName = subId.includes(".") ? subId.split(".")[1].replace(/_/g, " ") : subId;
      return {
        predominant: {
          active: true,
          type: "subtype",
          id: subId,
          name: cleanName,
          count,
          share: Math.round(share * 100) / 100,
        },
        mixed: null,
        categoryCounts,
        subtypeCounts,
      };
    }
  }

  // 2. Check Category Predominance (strict majority, no tie, count >= 2)
  for (const [cat, count] of Object.entries(categoryCounts)) {
    const share = count / total;
    if (share > PREDOMINANT_MAJORITY && count >= PREDOMINANT_MIN_MEETINGS) {
      const name = CATEGORY_NAMES[cat] || cat;
      return {
        predominant: {
          active: true,
          type: "category",
          id: cat,
          name,
          count,
          share: Math.round(share * 100) / 100,
        },
        mixed: null,
        categoryCounts,
        subtypeCounts,
      };
    }
  }

  // 3. Otherwise Mixed (>= 2 distinct categories)
  const distinctCategories = Object.keys(categoryCounts);
  if (distinctCategories.length >= MIXED_MIN_CATEGORIES) {
    // Sort categories by count descending to pick top 2
    const sortedCats = distinctCategories.sort(
      (a, b) => categoryCounts[b] - categoryCounts[a],
    );
    const top2 = sortedCats.slice(0, 2).map((c) => CATEGORY_NAMES[c] || c);
    const label = `Mixed: ${top2.join(" and ")}`;

    return {
      predominant: null,
      mixed: {
        active: true,
        categories: distinctCategories,
        label,
      },
      categoryCounts,
      subtypeCounts,
    };
  }

  return {
    predominant: null,
    mixed: null,
    categoryCounts,
    subtypeCounts,
  };
}
