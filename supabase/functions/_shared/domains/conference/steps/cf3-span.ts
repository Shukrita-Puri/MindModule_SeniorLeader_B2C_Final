// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step CF3 & CF4: Multi-Day Conference Span and Role Determination.
// Source: Part 2 Layer 2 (Section 4.4, CF3, CF4).

import type { ConferenceRole, ConferenceSessionItem } from "../types.ts";

export interface MultiDayConferenceInput {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export function stepConferenceSpanAndRole(params: {
  isConferenceDay: boolean;
  sessions: ConferenceSessionItem[];
  localDate: string;
  activeConferenceSpan?: MultiDayConferenceInput | null;
}): {
  dayNumber: number | null;
  totalDays: number | null;
  role: ConferenceRole;
  standaloneSpeaking: boolean;
} {
  let dayNumber: number | null = null;
  let totalDays: number | null = null;

  if (params.activeConferenceSpan) {
    const s = new Date(`${params.activeConferenceSpan.startDate}T00:00:00Z`).getTime();
    const e = new Date(`${params.activeConferenceSpan.endDate}T00:00:00Z`).getTime();
    const curr = new Date(`${params.localDate}T00:00:00Z`).getTime();

    totalDays = Math.max(1, Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1);
    if (curr >= s && curr <= e) {
      dayNumber = Math.max(1, Math.round((curr - s) / (24 * 60 * 60 * 1000)) + 1);
    }
  } else if (params.isConferenceDay) {
    dayNumber = 1;
    totalDays = 1;
  }

  const hasSpeakingSession = params.sessions.some((s) => s.isSpeaking);

  let role: ConferenceRole = "none";
  let standaloneSpeaking = false;

  if (params.isConferenceDay) {
    role = hasSpeakingSession ? "speaking" : "attending";
  } else if (hasSpeakingSession) {
    role = "speaking";
    standaloneSpeaking = true;
  } else if (params.sessions.length > 0) {
    role = "attending";
  }

  return {
    dayNumber,
    totalDays,
    role,
    standaloneSpeaking,
  };
}
