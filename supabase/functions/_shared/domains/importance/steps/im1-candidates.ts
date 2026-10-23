// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM1: Candidate Collection and Exclusion.
// Source: Part 2 Layer 2 (Section 4.9, IM1).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import type { ExcludedCandidate } from "../types.ts";

export interface CandidateItem {
  item: CanonicalCalendarItem;
  stamp: ClassificationStamp;
  isUserTaggedImportant: boolean;
  isWeekAheadChoice: boolean;
}

export function stepCollectCandidates(params: {
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  userPriorityItemIds?: string[];
  weekAheadChosenItemIds?: string[];
  weekAheadExcludedItemIds?: string[];
  horizonHours: number;
  nowUtc: Date;
}): {
  candidates: CandidateItem[];
  excluded: ExcludedCandidate[];
} {
  const candidates: CandidateItem[] = [];
  const excluded: ExcludedCandidate[] = [];

  const nowMs = params.nowUtc.getTime();
  const maxHorizonMs = nowMs + params.horizonHours * 60 * 60 * 1000;

  const prioritySet = new Set(params.userPriorityItemIds ?? []);
  const weekAheadChoiceSet = new Set(params.weekAheadChosenItemIds ?? []);
  const weekAheadExcludedSet = new Set(params.weekAheadExcludedItemIds ?? []);

  for (const item of params.items) {
    const id = item.externalId || item.identityKey;

    if (item.userReply === "declined") {
      excluded.push({ itemId: id, title: item.title, reason: "Declined by user" });
      continue;
    }

    if (weekAheadExcludedSet.has(id)) {
      excluded.push({ itemId: id, title: item.title, reason: "Marked never in Week Ahead" });
      continue;
    }

    // Check horizon
    if (item.startUtc) {
      const sMs = new Date(item.startUtc).getTime();
      if (sMs < nowMs - 60 * 60 * 1000 || sMs > maxHorizonMs) {
        // Outside horizon window
        continue;
      }
    }

    const stamp = params.stamps.find((s) => s.itemId === id);
    const cat = stamp?.category ?? "I";

    const isTagged = prioritySet.has(id);
    const isWAChoice = weekAheadChoiceSet.has(id);

    // Personal (H) items excluded unless tagged important by user
    if (cat === "H" && !isTagged && !isWAChoice) {
      excluded.push({ itemId: id, title: item.title, reason: "Personal event (Category H) without explicit priority tag" });
      continue;
    }

    candidates.push({
      item,
      stamp: stamp ?? {
        itemId: id,
        sourceType: "calendar",
        category: "I",
        categoryConfidence: 0.5,
        subtype: null,
        subtypeConfidence: 0,
        bestCandidateSubtype: null,
        confirmationState: "uncertain",
        decisionSource: "evidence",
        runnerUp: null,
        reasons: [],
        findings: [],
        dimensions: { stakes: "low", travelRelated: false, workContext: "work", durationMinutes: 30 },
        itemDemand: null,
        taxonomyVersion: "1.0",
        classifierVersion: "1.0",
        classifiedAt: params.nowUtc.toISOString(),
      },
      isUserTaggedImportant: isTagged,
      isWeekAheadChoice: isWAChoice,
    });
  }

  return { candidates, excluded };
}
