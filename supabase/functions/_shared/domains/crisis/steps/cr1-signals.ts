// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step CR1: Crisis Item Signals.
// Source: Part 2 Layer 2 (Section 4.7, CR1).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import { SHORT_NOTICE_HOURS, OUT_OF_HOURS_BEFORE, OUT_OF_HOURS_AFTER } from "../constants.ts";

export interface CrisisItemSignal {
  item: CanonicalCalendarItem;
  stamp: ClassificationStamp;
  isCategoryJ: boolean;
  isGovCrisis: boolean;
  isShortNotice: boolean;
  isOutOfHours: boolean;
  hasIncidentWording: boolean;
  hasCrisisStakeholders: boolean;
}

const CRISIS_STAKEHOLDER_RX =
  /\b(legal|counsel|lawyer|pr\s*firm|communications|crisis|regulator|security|sec|fca|incident|investigation)\b/i;

export function stepCrisisItemSignals(
  items: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
  isFirstSync = false,
  nowUtc: Date = new Date(),
): CrisisItemSignal[] {
  const result: CrisisItemSignal[] = [];

  for (const item of items) {
    const stamp = stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
    if (!stamp) continue;

    const cat = stamp.category;
    const sub = stamp.subtype;
    const isCategoryJ = cat === "J";
    const isGovCrisis = sub === "gov.crisis";

    // Short notice: first seen < 24h before start (items from first sync never count)
    let isShortNotice = false;
    if (!isFirstSync && item.startUtc) {
      const startMs = new Date(item.startUtc).getTime();
      const nowMs = nowUtc.getTime();
      // If start is in the future or started within 24h
      const diffHours = (startMs - nowMs) / (1000 * 60 * 60);
      if (diffHours >= -24 && diffHours <= SHORT_NOTICE_HOURS) {
        isShortNotice = true;
      }
    }

    // Out of working hours: before 08:00 or after 19:00
    let isOutOfHours = false;
    if (item.startUtc) {
      const timeStr = item.startUtc.slice(11, 16);
      if (timeStr < OUT_OF_HOURS_BEFORE || timeStr > OUT_OF_HOURS_AFTER) {
        isOutOfHours = true;
      }
    }

    const titleLower = item.title.toLowerCase();
    const hasIncidentWording =
      titleLower.includes("outage") ||
      titleLower.includes("war room") ||
      titleLower.includes("sev-1") ||
      titleLower.includes("incident") ||
      titleLower.includes("emergency") ||
      titleLower.includes("escalation");

    let hasCrisisStakeholders = false;
    for (const a of item.attendees) {
      if ((a.name && CRISIS_STAKEHOLDER_RX.test(a.name)) ||
          (a.domain && CRISIS_STAKEHOLDER_RX.test(a.domain))) {
        hasCrisisStakeholders = true;
        break;
      }
    }
    if (CRISIS_STAKEHOLDER_RX.test(item.title)) {
      hasCrisisStakeholders = true;
    }

    result.push({
      item,
      stamp,
      isCategoryJ,
      isGovCrisis,
      isShortNotice,
      isOutOfHours,
      hasIncidentWording,
      hasCrisisStakeholders,
    });
  }

  return result;
}
