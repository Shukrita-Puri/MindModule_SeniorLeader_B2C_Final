// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step LD1 & LD2: Item Sorting and Personal Composition.
// Source: Part 2 Layer 2 (Section 4.5, LD1, LD2).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import { HALF_DAY_PERSONAL_SHARE } from "../constants.ts";

export interface SortedLoadItems {
  workMeetings: CanonicalCalendarItem[];
  focusBlocks: CanonicalCalendarItem[];
  personalItems: CanonicalCalendarItem[];
  travelItems: CanonicalCalendarItem[];
  isPersonalDay: boolean;
  isHalfDay: boolean;
  totalWorkMinutes: number;
  totalFocusMinutes: number;
}

export function stepSortLoadItems(
  items: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
): SortedLoadItems {
  const workMeetings: CanonicalCalendarItem[] = [];
  const focusBlocks: CanonicalCalendarItem[] = [];
  const personalItems: CanonicalCalendarItem[] = [];
  const travelItems: CanonicalCalendarItem[] = [];

  let totalWorkMinutes = 0;
  let totalFocusMinutes = 0;
  let totalPersonalMinutes = 0;

  for (const item of items) {
    // Drop declined items
    if (item.userReply === "declined") continue;

    const stamp = stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
    const cat = stamp?.category ?? "I";

    const startMs = item.startUtc ? new Date(item.startUtc).getTime() : 0;
    const endMs = item.endUtc ? new Date(item.endUtc).getTime() : 0;
    const duration = (endMs > startMs) ? Math.round((endMs - startMs) / 60000) : 30;

    if (cat === "H") {
      personalItems.push(item);
      totalPersonalMinutes += duration;
    } else if (cat === "G") {
      travelItems.push(item);
    } else if (cat === "E" && (stamp?.subtype === "str.deep_work" || item.eventType === "focusTime")) {
      focusBlocks.push(item);
      totalFocusMinutes += duration;
      totalWorkMinutes += duration;
    } else {
      // Work meeting (including blocked meetings)
      workMeetings.push(item);
      totalWorkMinutes += duration;
    }
  }

  const timedCount = workMeetings.length + focusBlocks.length + personalItems.length;
  const isPersonalDay = timedCount > 0 && workMeetings.length === 0 && focusBlocks.length === 0;

  let isHalfDay = false;
  if (!isPersonalDay && timedCount > 0) {
    const personalCountShare = personalItems.length / timedCount;
    const totalTimedMinutes = totalWorkMinutes + totalPersonalMinutes;
    const personalTimeShare = totalTimedMinutes > 0 ? totalPersonalMinutes / totalTimedMinutes : 0;
    isHalfDay = personalCountShare >= HALF_DAY_PERSONAL_SHARE || personalTimeShare >= HALF_DAY_PERSONAL_SHARE;
  }

  return {
    workMeetings,
    focusBlocks,
    personalItems,
    travelItems,
    isPersonalDay,
    isHalfDay,
    totalWorkMinutes,
    totalFocusMinutes,
  };
}
