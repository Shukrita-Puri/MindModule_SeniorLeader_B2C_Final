// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Conference Domain Types.
// Source: Part 2 Layer 2 (Section 4.4).

export type ConferenceItemKind = "conference_day" | "conference_session" | "external_event";

export type ConferenceRole = "speaking" | "attending" | "none";

export type ConferencePlace = "in_town" | "away" | "online" | "none";

export type TrailingLoadTier = "high" | "medium" | "low" | "none";

export interface ConferenceSessionItem {
  id: string;
  title: string;
  kind: ConferenceItemKind;
  isSpeaking: boolean;
  durationMinutes: number;
  startUtc?: string | null;
  endUtc?: string | null;
}

export interface ConferenceFacts {
  isConferenceDay: boolean;
  dayNumber: number | null;
  totalDays: number | null;
  sessions: ConferenceSessionItem[];
  role: ConferenceRole;
  standaloneSpeaking: boolean;
  place: ConferencePlace;
  travelRelated: boolean;
  parallelMeetings: number;
  firstSessionGapMinutes: number | null;
  trailingConferenceDays: number;
  trailingLoad: TrailingLoadTier;
  startsTomorrow: boolean;
  reentryDay: boolean;
  source: "tag" | "stamp" | "none";
}
