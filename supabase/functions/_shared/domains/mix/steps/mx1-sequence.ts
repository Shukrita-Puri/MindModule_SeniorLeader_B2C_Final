// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step MX1 & MX2: Sequence and Meeting Gaps.
// Source: Part 2 Layer 2 (Section 4.6, MX1, MX2).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";

export interface SequencedMeeting {
  item: CanonicalCalendarItem;
  stamp: ClassificationStamp;
  category: string;
  subtype: string | null;
  startMs: number;
  endMs: number;
  gapFromPreviousMin: number;
}

export function stepSequenceMeetings(
  workMeetings: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
  personalItems: CanonicalCalendarItem[] = [],
): SequencedMeeting[] {
  // Sort work meetings by start
  const sorted = [...workMeetings].sort((a, b) => {
    const sA = a.startUtc ? new Date(a.startUtc).getTime() : 0;
    const sB = b.startUtc ? new Date(b.startUtc).getTime() : 0;
    return sA - sB;
  });

  const result: SequencedMeeting[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const stamp = stamps.find((s) => s.itemId === (item.externalId || item.identityKey)) ?? {
      itemId: item.externalId || item.identityKey,
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
      classifiedAt: new Date().toISOString(),
    };

    const startMs = item.startUtc ? new Date(item.startUtc).getTime() : 0;
    const endMs = item.endUtc ? new Date(item.endUtc).getTime() : 0;

    let gapMin = 999;
    if (i > 0) {
      const prevEndMs = result[i - 1].endMs;
      const rawGap = Math.max(0, Math.round((startMs - prevEndMs) / 60000));

      // Check if any personal item falls between prevEndMs and startMs
      // Personal items between meetings count as gap time
      const hasPersonalBetween = personalItems.some((p) => {
        const pStart = p.startUtc ? new Date(p.startUtc).getTime() : 0;
        const pEnd = p.endUtc ? new Date(p.endUtc).getTime() : 0;
        return pStart >= prevEndMs && pEnd <= startMs && (pEnd > pStart);
      });

      gapMin = hasPersonalBetween ? Math.max(rawGap, 30) : rawGap;
    }

    result.push({
      item,
      stamp,
      category: stamp.category ?? "I",
      subtype: stamp.subtype ?? null,
      startMs,
      endMs,
      gapFromPreviousMin: gapMin,
    });
  }

  return result;
}
