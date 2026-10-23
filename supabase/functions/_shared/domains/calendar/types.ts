// [KIND: specification] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain contracts for Layer 0 Calendar.
// Source: Part 2 Layer 0 (Section 4, 12.1), Part 4 Tree (calendar/).

import type { Provenance } from "../../spine/types.ts";

export type CalendarProviderName = "apple" | "google" | "microsoft" | string;

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

export interface CalendarMergeInput {
  id?: string | null;
  external_id?: string | null;
  title?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  start_time?: string | Date | null;
  end_time?: string | Date | null;
  provider?: CalendarProviderName | null;
  source?: CalendarProviderName | null;
  sourceCalendar?: string | null;
  source_calendar?: string | null;
  sourceCalendarId?: string | null;
  calendar_id?: string | null;
  attendeesCount?: number | null;
  attendees_count?: number | null;
  isOrganizer?: boolean | null;
  is_organizer?: boolean | null;
  isRecurring?: boolean | null;
  is_recurring?: boolean | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  updatedAt?: string | Date | null;
  updated_at?: string | Date | null;
  status?: string | null;
  event_metadata?: Record<string, unknown> | null;
  eventMetadata?: Record<string, unknown> | null;
  organizer?: {
    displayName?: string | null;
    email?: string | null;
    isSelf?: boolean | null;
  } | null;
  attendees?: Array<{
    displayName?: string | null;
    email?: string | null;
    responseStatus?: string | null;
    isOrganizer?: boolean | null;
    isSelf?: boolean | null;
  }> | null;
  location?: string | null;
  description?: string | null;
  body?: string | null;
  conferenceUrl?: string | null;
  meetingUrl?: string | null;
  onlineMeetingUrl?: string | null;
  webLink?: string | null;
  [key: string]: unknown;
}

export interface MergedCalendarAttendee {
  displayName: string | null;
  email: string | null;
  responseStatus: string | null;
  isOrganizer: boolean;
  isSelf: boolean;
}

export interface MergedCalendarOrganizer {
  displayName: string | null;
  email: string | null;
  isSelf: boolean;
}

export interface MergedCalendarEvent extends CalendarMergeInput {
  id: string;
  canonicalEventId: string;
  mergedEventId: string;
  identityKey: string;
  mergedFromCount: number;
  sourceCalendars: string[];
  providerEventIds: Record<string, string[]>;
  rawEventIds: string[];
  attendees: MergedCalendarAttendee[];
  organizer: MergedCalendarOrganizer | null;
  attendeesCount: number | null;
  isOrganizer: boolean | null;
  isRecurring: boolean | null;
  status: string | null;
  statusUpdatedAt: string | null;
  location: string | null;
  description: string | null;
  conferenceUrl: string | null;
  eventMetadata: Record<string, unknown> | null;
  isBusyBlock: boolean;
  isSoftHold: boolean;
  isSuppressedMirror: boolean;
}
