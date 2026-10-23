// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step CF5, CF6 & CF7: Conference Place, Parallel Meetings, Trailing Load & Re-entry.
// Source: Part 2 Layer 2 (Section 4.4, CF5, CF6, CF7).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import type { ConferencePlace, TrailingLoadTier } from "../types.ts";
import { PARALLEL_MEETING_MIN_MINUTES, REENTRY_MIN_RUN_DAYS } from "../constants.ts";

export function stepConferenceLoadContext(params: {
  isConferenceDay: boolean;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  isTravellingAway: boolean;
  activeConferenceDaysTotal?: number | null;
  yesterdayWasMultiDayConferenceEnd?: boolean;
  tomorrowHasConference?: boolean;
  meetingsNext3DaysCount?: number;
}): {
  place: ConferencePlace;
  travelRelated: boolean;
  parallelMeetings: number;
  firstSessionGapMinutes: number | null;
  trailingConferenceDays: number;
  trailingLoad: TrailingLoadTier;
  startsTomorrow: boolean;
  reentryDay: boolean;
} {
  // Place detection
  let place: ConferencePlace = "none";
  let travelRelated = false;

  if (params.isConferenceDay) {
    if (params.isTravellingAway) {
      place = "away";
      travelRelated = true;
    } else {
      // Check if items are online-only
      const onlineOnly = params.items.every((i) => i.meeting?.online === true && !i.location?.address);
      place = onlineOnly ? "online" : "in_town";
      travelRelated = false;
    }
  }

  // Count non-conference work meetings squeezed around the conference day
  let parallelMeetings = 0;
  if (params.isConferenceDay) {
    for (const item of params.items) {
      const stamp = params.stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
      if (!stamp) continue;
      if (stamp.category !== "F" && stamp.category !== "C" && stamp.category !== "H") {
        const startMs = item.startUtc ? new Date(item.startUtc).getTime() : 0;
        const endMs = item.endUtc ? new Date(item.endUtc).getTime() : 0;
        const duration = (endMs > startMs) ? (endMs - startMs) / 60000 : 30;
        if (duration >= PARALLEL_MEETING_MIN_MINUTES) {
          parallelMeetings++;
        }
      }
    }
  }

  // Trailing load
  const totalDays = params.activeConferenceDaysTotal ?? 1;
  const meetingsAhead = params.meetingsNext3DaysCount ?? 0;
  let trailingLoad: TrailingLoadTier = "none";

  if (totalDays >= 2 && meetingsAhead >= 10) {
    trailingLoad = "high";
  } else if (totalDays >= 1 && meetingsAhead >= 6) {
    trailingLoad = "medium";
  } else if (totalDays >= 1) {
    trailingLoad = "low";
  }

  const reentryDay = Boolean(
    params.yesterdayWasMultiDayConferenceEnd && totalDays >= REENTRY_MIN_RUN_DAYS
  );

  return {
    place,
    travelRelated,
    parallelMeetings,
    firstSessionGapMinutes: null,
    trailingConferenceDays: totalDays,
    trailingLoad,
    startsTomorrow: Boolean(params.tomorrowHasConference),
    reentryDay,
  };
}
