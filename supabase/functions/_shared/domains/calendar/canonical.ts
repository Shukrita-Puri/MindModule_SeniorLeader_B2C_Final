// [KIND: implementation] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Canonical Calendar Item Builder.
// Source: Part 2 Layer 0 (Section 4, 12.1).

import type { Provenance } from "../../spine/types.ts";
import type { CalendarMergeInput, MergedCalendarEvent } from "./merge.ts";
import { computeIdentityKey, normalizeForClassify } from "./merge.ts";

export interface AttendeeSignal {
  name: string | null;
  email: string | null;
  domain: string | null;
  reply: "accepted" | "declined" | "tentative" | "needsAction" | null;
  isSelf: boolean;
  isOrganizer: boolean;
  isResource: boolean;
}

export interface CanonicalCalendarItem {
  schemaVersion: 1;
  userId: string;
  provider: "google" | "microsoft" | "apple";
  externalId: string;
  seriesId: string | null;
  originalStartUtc: string | null;
  identityKey: string;
  title: string;
  cleanTitle: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  localStartDate: string;
  localEndDate: string;
  timeZone: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  showAs: "free" | "busy" | "tentative" | "oof" | "elsewhere" | null;
  eventType: "default" | "outOfOffice" | "focusTime" | "workingLocation" | null;
  userReply: "accepted" | "declined" | "tentative" | "needsAction" | "organizer" | null;
  organizer: AttendeeSignal | null;
  attendees: AttendeeSignal[];
  location: {
    text: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    room: boolean;
  };
  meeting: {
    url: string | null;
    provider: string | null;
    online: boolean;
  };
  descriptionCues: string[];
  categories: string[];
  visibility: "default" | "private" | "confidential";
  importance: "low" | "normal" | "high" | null;
  providerCreatedAt: string | null;
  firstSeenAt: string;
  provenance: Provenance;
}

/**
 * Builds a CanonicalCalendarItem from raw provider data with strict validation.
 */
export function toCanonicalCalendarItem(input: {
  userId: string;
  raw: CalendarMergeInput;
  provenance: Provenance;
}): CanonicalCalendarItem {
  const { userId, raw, provenance } = input;
  const provider = (raw.provider ?? raw.source ?? "google").toLowerCase() as "google" | "microsoft" | "apple";
  const externalId = String(raw.external_id ?? raw.id ?? "");
  const identityKey = computeIdentityKey(raw) ?? `key_${externalId}`;
  const title = String(raw.title ?? "").trim();
  const cleanTitle = normalizeForClassify(title);

  const startVal = raw.startTime ?? raw.start_time;
  const endVal = raw.endTime ?? raw.end_time;
  const startUtc = startVal ? new Date(startVal as string).toISOString() : new Date().toISOString();
  const endUtc = endVal ? new Date(endVal as string).toISOString() : startUtc;

  const rawAttendees = Array.isArray(raw.attendees) ? raw.attendees : [];
  const attendees: AttendeeSignal[] = rawAttendees.map((a) => {
    const email = a.email ?? null;
    const domain = email ? email.split("@")[1]?.toLowerCase() ?? null : null;
    return {
      name: a.displayName ?? null,
      email,
      domain,
      reply: (a.responseStatus ?? null) as AttendeeSignal["reply"],
      isSelf: Boolean(a.isSelf),
      isOrganizer: Boolean(a.isOrganizer),
      isResource: false,
    };
  });

  const organizer: AttendeeSignal | null = raw.organizer
    ? {
        name: raw.organizer.displayName ?? null,
        email: raw.organizer.email ?? null,
        domain: raw.organizer.email ? raw.organizer.email.split("@")[1]?.toLowerCase() ?? null : null,
        reply: "accepted",
        isSelf: Boolean(raw.organizer.isSelf),
        isOrganizer: true,
        isResource: false,
      }
    : null;

  return {
    schemaVersion: 1,
    userId,
    provider,
    externalId,
    seriesId: (raw.seriesId as string) ?? null,
    originalStartUtc: (raw.originalStartUtc as string) ?? null,
    identityKey,
    title,
    cleanTitle,
    startUtc,
    endUtc,
    allDay: Boolean(raw.allDay ?? raw.is_all_day),
    localStartDate: startUtc.split("T")[0],
    localEndDate: endUtc.split("T")[0],
    timeZone: (raw.timeZone as string) ?? null,
    status: (raw.status as CanonicalCalendarItem["status"]) ?? "confirmed",
    showAs: "busy",
    eventType: "default",
    userReply: "accepted",
    organizer,
    attendees,
    location: {
      text: (raw.location as string) ?? null,
      address: null,
      lat: null,
      lng: null,
      room: false,
    },
    meeting: {
      url: (raw.conferenceUrl ?? raw.meetingUrl ?? raw.onlineMeetingUrl as string) ?? null,
      provider: null,
      online: Boolean(raw.conferenceUrl || raw.meetingUrl || raw.onlineMeetingUrl),
    },
    descriptionCues: [],
    categories: [],
    visibility: "default",
    importance: "normal",
    providerCreatedAt: raw.created_at ? new Date(raw.created_at as string).toISOString() : null,
    firstSeenAt: new Date().toISOString(),
    provenance,
  };
}
