// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Core Spine Data Contracts & Common Types.
// Source: Part 2 Layer 0 (Section 12.1) and Knowledge Spine (Section 9.3).

import type { CategoryLetter } from "./categories.ts";
import type { DemandVector } from "./dimensions.ts";
import type { MemoryKind, RelationshipRole } from "./vocabularies.ts";

export interface Provenance {
  source: string;
  version?: string;
  sourceVersion?: string;
  parserVersion?: string;
  traceId: string;
  receivedAt?: string;
  confidence?: number;
  atUtc?: string;
}

export interface AttendeeInfo {
  displayName: string | null;
  email: string | null;
  emailDomain: string | null;
  isCurrentUser: boolean;
  isOrganizer: boolean;
  role?: RelationshipRole;
}

export interface CanonicalItem {
  id: string;
  externalId?: string;
  sourceType: "google" | "microsoft" | "apple" | "manual";
  title: string;
  cleanTitle: string;
  description?: string | null;
  location?: string | null;
  startTimeUtc: string;
  endTimeUtc: string;
  durationMinutes: number;
  isAllDay: boolean;
  isRecurring: boolean;
  seriesId?: string | null;
  originalStartUtc?: string | null;
  attendeesCount: number;
  attendees: AttendeeInfo[];
  isOrganizer: boolean;
  meetingUrl?: string | null;
  provenance: Provenance;
}

export interface CanonicalWearableDay {
  userId: string;
  localDate: string; // YYYY-MM-DD
  hrv: number | null; // ms
  restingHeartRate: number | null; // bpm
  sleepScore: number | null; // 0-100
  totalSleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  sleepEfficiency: number | null; // 0-100
  readinessScore: number | null; // 0-100
  isOutlierHrv: boolean;
  isOutlierRhr: boolean;
  provenance: Provenance;
}

export interface EventClassificationStamp {
  itemId: string;
  category: CategoryLetter;
  categoryName: string;
  subtype: string | null;
  confidence: number;
  confidenceTier: "high" | "medium" | "low";
  isConfirmed: boolean;
  memoryKind: MemoryKind;
  dimensions: DemandVector;
  reasons: string[];
  resolvedAtUtc: string;
  version: string;
}

export interface CapabilityFlags {
  schemaVersion: 1;
  userId: string;
  hasCalendar: boolean;
  hasWearable: boolean;
  hasLocation: boolean;
  calendarProviders: Record<"google" | "microsoft" | "apple", boolean>;
  wearableProviders: Record<"oura" | "apple_health", boolean>;
  locationPermitted: boolean;
}
