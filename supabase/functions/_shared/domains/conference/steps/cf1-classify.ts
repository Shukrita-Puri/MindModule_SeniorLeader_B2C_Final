// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step CF1 & CF2: Conference Item Classification.
// Source: Part 2 Layer 2 (Section 4.4, CF1, CF2).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import type { ConferenceItemKind, ConferenceSessionItem } from "../types.ts";
import { CONFERENCE_DAY_MIN_MINUTES } from "../constants.ts";

export function stepClassifyConferenceItems(
  items: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
  userDayTags?: string[],
): {
  sessions: ConferenceSessionItem[];
  hasConferenceDayItem: boolean;
  hasTagOverride: boolean;
} {
  const hasTagOverride = Boolean(
    userDayTags && userDayTags.some((t) => t.toLowerCase() === "conference")
  );

  const sessions: ConferenceSessionItem[] = [];
  let hasConferenceDayItem = hasTagOverride;

  for (const item of items) {
    const stamp = stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
    if (!stamp) continue;

    const cat = stamp.category;
    const sub = stamp.subtype ?? "";
    const isSpeakingCategory = cat === "C";
    const isConferenceCategory = cat === "F";

    if (!isConferenceCategory && !isSpeakingCategory) continue;

    const startMs = item.startUtc ? new Date(item.startUtc).getTime() : 0;
    const endMs = item.endUtc ? new Date(item.endUtc).getTime() : 0;
    const durationMinutes = (endMs > startMs)
      ? Math.round((endMs - startMs) / 60000)
      : (stamp.dimensions.durationMinutes ?? 60);

    let kind: ConferenceItemKind = "conference_session";

    if (item.allDay || durationMinutes >= CONFERENCE_DAY_MIN_MINUTES || hasTagOverride) {
      kind = "conference_day";
      hasConferenceDayItem = true;
    } else if (sub === "conf.award" || sub === "conf.networking" || item.title.toLowerCase().includes("dinner") || item.title.toLowerCase().includes("drinks")) {
      kind = "external_event";
    } else {
      kind = "conference_session";
    }

    const isSpeaking = isSpeakingCategory ||
      sub === "conf.keynote" ||
      sub === "conf.speaking" ||
      item.title.toLowerCase().includes("keynote") ||
      item.title.toLowerCase().includes("panelist") ||
      item.title.toLowerCase().includes("speaking");

    sessions.push({
      id: item.externalId || item.identityKey,
      title: item.title,
      kind,
      isSpeaking,
      durationMinutes,
      startUtc: item.startUtc,
      endUtc: item.endUtc,
    });
  }

  return {
    sessions,
    hasConferenceDayItem,
    hasTagOverride,
  };
}
