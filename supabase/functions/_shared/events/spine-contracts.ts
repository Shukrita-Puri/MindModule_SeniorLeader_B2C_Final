// OWNERSHIP: engineering + coaching.
// Knowledge Spine contracts for the A–J Event Intelligence Service.
// Reference: "A–J Event Classification: Final Design" (§3, §4, §6, §10, §14).
//
// These contracts define the canonical item shapes, gathered findings,
// classification stamp, provenance, correction scopes, and memory service interface.

import type { EventCategoryId, EventCategory } from "./event-categories.ts";
import type { EventType, DemandProfile } from "./event-subtypes.ts";

// ── Contract 1: Canonical Item ─────────────────────────────────────────

export type ItemSourceType =
  | "calendar"
  | "email"
  | "teams"
  | "slack"
  | "social"
  | "document"
  | "connector";

export interface CanonicalAttendee {
  name?: string | null;
  email?: string | null;
  domain?: string | null;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction" | string | null;
  isSelf?: boolean;
  isOrganizer?: boolean;
}

export interface CanonicalPlace {
  locationText?: string | null;
  videoLink?: string | null;
  room?: string | null;
  isFarFromHome?: boolean | null;
}

export interface CanonicalTime {
  startTime: string; // ISO string
  endTime?: string | null;
  isAllDay?: boolean;
  timezone?: string | null;
  durationMinutes?: number | null;
}

export interface CanonicalItem {
  itemId: string;
  sourceType: ItemSourceType;
  title: string;
  description?: string | null;
  status?: "confirmed" | "tentative" | "cancelled" | string | null;
  organizer?: CanonicalAttendee | null;
  attendees?: CanonicalAttendee[];
  place?: CanonicalPlace | null;
  time?: CanonicalTime | null;
  seriesId?: string | null;
  isRecurring?: boolean;
  providerLabels?: string[];
  calendarName?: string | null;
  raw?: Record<string, unknown> | null;
}

// ── Contract 2: Finding & Evidence Families ────────────────────────────

export type EvidenceFamily =
  | "text"        // title, description, notes
  | "people"      // attendee identities, sides, organizer
  | "relationship"// derived or confirmed relationships and direction
  | "place"       // location, distance, venue, links
  | "time"        // duration, hour, rhythm, calendar labels
  | "provider"    // provider-declared status, out-of-office, holiday calendar
  | "memory";     // user confirmation, series memory, scoped tags

export type FindingType =
  | "format"        // 1:1, group, talk, webinar, trip, hold, personal
  | "intent"        // decide, persuade, present, learn, review, run_ops, incident, catch_up
  | "topic"         // board, investor, pitch, hiring, flight, etc.
  | "side"          // internal_only, internal_plus_external, external_only, personal
  | "relationship"  // boss, report, board, investor, prospect, client, vendor, partner, etc.
  | "direction"     // user_selling, user_buying, reporting_up, on_stage
  | "setting"       // online, office, venue, public, home, far_from_home
  | "shape"         // short, standard, long, all_day, multi_day, short_notice
  | "label";        // out_of_office, focus, tentative, user_label

export type FindingStrength = "decisive" | "strong" | "medium" | "weak";
export type SourceTrust = "user" | "company_context" | "domain_pattern" | "org_profile" | "history" | "llm" | "provider";

export interface Finding {
  type: FindingType;
  value: string;
  family: EvidenceFamily;
  strength: FindingStrength;
  sourceTrust: SourceTrust;
  source: string; // e.g. "title", "attendee_domain", "calendar_label"
  description?: string;
}

// ── Contract 3: Classification Stamp ───────────────────────────────────

export type ConfirmationState =
  | "confirmed"        // User confirmed or provider factual (out-of-office, holiday calendar)
  | "inferred_high"    // Machine result >= 0.75
  | "inferred_medium"  // Machine result 0.55 - 0.75
  | "uncertain";       // Machine result < 0.55

export type DecisionSource =
  | "user_correction"
  | "provider_label"
  | "confirmed_memory"
  | "evidence"
  | "llm"
  | "legacy_fallback";

export interface ItemDimensions {
  format?: string | null;           // "1:1" | "group" | "talk" | "trip" | "hold" | "personal"
  relationship?: string | null;     // "boss" | "board" | "investor" | "prospect" | "colleague" | ...
  direction?: string | null;        // "user_selling" | "reporting_up" | "on_stage" | ...
  stakes?: "critical" | "high" | "medium" | "low" | string | null;
  locationType?: "online" | "office" | "venue" | "travel" | "personal" | string | null;
  travelRelated: boolean;
  workContext: "work" | "personal";
  durationMinutes: number | null;
  crisisEpisodeId?: string | null;
}

export interface ItemDemandComputed {
  demandProfile: DemandProfile;
  arousal: number;
  switchCost: number;
  recoveryMinutes: number;
}

export interface ClassificationStamp {
  itemId: string;
  sourceType: ItemSourceType;

  // Primary category & confidence
  category: EventCategoryId | null;
  categoryConfidence: number; // 0 to 1

  // Granular subtype & confidence
  subtype: string | null; // subtype id (e.g. "inf.client_presentation")
  subtypeConfidence: number; // 0 to 1
  bestCandidateSubtype: string | null; // leading candidate even if not confident

  confirmationState: ConfirmationState;
  decisionSource: DecisionSource;

  runnerUp: {
    category: EventCategoryId | null;
    subtype: string | null;
    confidence: number;
  } | null;

  reasons: string[]; // Top 3 reasons
  findings: Finding[];
  dimensions: ItemDimensions;
  itemDemand?: ItemDemandComputed | null;

  // Provenance & Versioning
  taxonomyVersion: string;   // e.g. "2026.09.A_J"
  classifierVersion: string; // e.g. "v3"
  inputHash: string;         // Hash of title, attendees, times, place
  classifiedAt: string;      // ISO timestamp
}

// ── Contract 4 & 5: Correction Scope & Minimum Memory ──────────────────

export type MemoryScopeType =
  | "event"         // This occurrence only
  | "series"        // Every occurrence of recurring series
  | "title_pattern" // Titles matching pattern
  | "person"        // Meetings with this person (email)
  | "organisation"; // Meetings with this domain

export type MemoryType =
  | "event_category"
  | "negative_category" // "not this"
  | "relationship"
  | "importance";

export interface ScopedMemoryRecord {
  id?: string;
  userId: string;
  scopeType: MemoryScopeType;
  scopeKey: string; // event id, series id, pattern string, email, or domain
  memoryType: MemoryType;
  value: string; // e.g. "E", "D", "prospect", "client"
  subtypeId?: string | null;
  source: "user" | "reviewed_rule" | "provider" | "inferred";
  confidence: number; // 1.0 for user
  confirmedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null; // For undo
  version: string;
}

// ── Contract 6 & 7: Read Surface & Invalidation ────────────────────────

export interface InvalidationTrigger {
  reason:
    | "event_mutated"         // title, times, attendees, location changed
    | "memory_changed"        // user correction, negative memory, confirmation
    | "relationship_changed"  // domain or contact profile updated
    | "org_profile_completed" // company context or org profile completed
    | "taxonomy_version_bump" // A–J version updated
    | "manual_reclassify";
  itemId: string;
  invalidatedAt: string;
}

// ── Helpers: Canonical Item & Stamp Construction ───────────────────────

export function buildCanonicalItemFromRaw(raw: any): CanonicalItem {
  const itemId = String(raw?.id ?? raw?.event?.id ?? `event_${Date.now()}`);
  const title = String(raw?.title ?? raw?.event?.title ?? "").trim();
  const description = raw?.description ?? raw?.event?.description ?? null;
  const status = raw?.status ?? raw?.event?.status ?? null;
  const calendarName = raw?.calendar_name ?? raw?.calendarName ?? null;
  const isRecurring = Boolean(raw?.recurring_event_id ?? raw?.is_recurring ?? raw?.series_id ?? raw?.recurrence);
  const seriesId = raw?.series_id ?? raw?.recurring_event_id ?? null;

  // Attendees
  const rawAttendees = raw?.attendees ?? raw?.attendeeSignals?.attendees ?? [];
  const attendees: CanonicalAttendee[] = Array.isArray(rawAttendees)
    ? rawAttendees.map((a: any) => ({
        name: a?.displayName ?? a?.name ?? null,
        email: a?.email ?? a?.contactUrl ?? null,
        domain: (a?.email ? a.email.split("@")[1]?.toLowerCase() : null) ?? a?.domain ?? null,
        responseStatus: a?.responseStatus ?? null,
        isSelf: Boolean(a?.isSelf),
        isOrganizer: Boolean(a?.isOrganizer),
      }))
    : [];

  const rawOrg = raw?.organizer ?? raw?.attendeeSignals?.organizer;
  const organizer: CanonicalAttendee | null = rawOrg
    ? {
        name: rawOrg?.displayName ?? rawOrg?.name ?? null,
        email: rawOrg?.email ?? rawOrg?.contactUrl ?? null,
        domain: (rawOrg?.email ? rawOrg.email.split("@")[1]?.toLowerCase() : null) ?? rawOrg?.domain ?? null,
        isSelf: Boolean(rawOrg?.isCurrentUser ?? rawOrg?.isSelf),
        isOrganizer: true,
      }
    : null;

  // Place
  const locationText = raw?.location ?? raw?.event?.location ?? null;
  const videoLink = raw?.conferenceData?.entryPoints?.[0]?.uri ?? raw?.meet_link ?? null;
  const isFarFromHome = Boolean(raw?.is_far_from_home ?? raw?.travelState === "travelling");
  const place: CanonicalPlace = {
    locationText,
    videoLink,
    room: raw?.room ?? null,
    isFarFromHome,
  };

  // Time
  const startTime = raw?.start_time ?? raw?.startTime ?? raw?.start?.dateTime ?? raw?.start ?? new Date().toISOString();
  const endTime = raw?.end_time ?? raw?.endTime ?? raw?.end?.dateTime ?? raw?.end ?? null;
  const isAllDay = Boolean(raw?.is_all_day ?? raw?.allDay);
  let durationMinutes: number | null = null;
  if (startTime && endTime) {
    const s = new Date(startTime).getTime();
    const e = new Date(endTime).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      durationMinutes = Math.round((e - s) / 60000);
    }
  }

  const time: CanonicalTime = {
    startTime: typeof startTime === "string" ? startTime : new Date(startTime).toISOString(),
    endTime: typeof endTime === "string" ? endTime : (endTime ? new Date(endTime).toISOString() : null),
    isAllDay,
    timezone: raw?.timezone ?? null,
    durationMinutes,
  };

  return {
    itemId,
    sourceType: "calendar",
    title,
    description,
    status,
    organizer,
    attendees,
    place,
    time,
    seriesId,
    isRecurring,
    calendarName,
    raw,
  };
}

export function computeItemDemand(
  category: EventCategory | null,
  subtype: EventType | null,
  durationMinutes: number | null = null,
): ItemDemandComputed | null {
  if (!category && !subtype) return null;
  const baseline = category?.demandBaseline;
  const profile = subtype?.demandProfile ?? (baseline ? {
    cog: baseline.cog,
    emo: baseline.emo,
    vis: baseline.vis,
    pol: baseline.pol,
    rel: baseline.rel,
    ene: baseline.ene,
    cir: baseline.cir,
    id: baseline.id,
  } as DemandProfile : { cog: 1, emo: 1, vis: 0, pol: 0, rel: 1, ene: 1, cir: 0, id: 0 } as DemandProfile);

  const arousal = subtype?.arousal ?? baseline?.arousal ?? Math.max(profile.emo, profile.vis, profile.pol);
  const switchCost = subtype?.switchCost ?? baseline?.switchCost ?? 1;

  // Recovery minutes calculation: base 15m up to 60m depending on duration & arousal
  let recoveryMinutes = subtype?.recoveryMinutes ?? 15;
  if (durationMinutes && durationMinutes >= 90) {
    recoveryMinutes = Math.max(recoveryMinutes, 30);
  }
  if (arousal >= 3) {
    recoveryMinutes = Math.max(recoveryMinutes, 45);
  }

  return {
    demandProfile: profile,
    arousal,
    switchCost,
    recoveryMinutes,
  };
}

export function buildClassificationStamp(input: {
  raw: any;
  title: string;
  category: EventCategory | null;
  subtype: EventType | null;
  confidence: "high" | "medium" | "low";
  source: string;
  durationMinutes: number | null;
  travelArc?: string | null;
}): ClassificationStamp {
  const { raw, title, category, subtype, confidence, source, durationMinutes } = input;
  const itemId = String(raw?.id ?? raw?.event?.id ?? `event_${Date.now()}`);

  const isConfirmedSource = source.includes("user") ||
    source.includes("confirmed") ||
    source.includes("override") ||
    source.includes("layer1_tags");
  const categoryConfidence = isConfirmedSource
    ? 1.0
    : (confidence === "high" ? 0.90 : confidence === "medium" ? 0.70 : 0.40);
  const subtypeConfidence = subtype ? (isConfirmedSource ? 1.0 : (confidence === "high" ? 0.85 : confidence === "medium" ? 0.65 : 0.35)) : 0.0;

  let confirmationState: ConfirmationState = "inferred_medium";
  if (isConfirmedSource) {
    confirmationState = "confirmed";
  } else if (categoryConfidence >= 0.75) {
    confirmationState = "inferred_high";
  } else if (categoryConfidence >= 0.55) {
    confirmationState = "inferred_medium";
  } else {
    confirmationState = "uncertain";
  }

  let decisionSource: DecisionSource = "evidence";
  if (source.includes("user_override") || source.includes("user_tag") || source.includes("layer1_tags")) {
    decisionSource = "user_correction";
  } else if (source.includes("confirmed_title") || source.includes("memory") || source.includes("confirmed")) {
    decisionSource = "confirmed_memory";
  } else if (source.includes("provider") || source.includes("status")) {
    decisionSource = "provider_label";
  } else if (source.includes("llm")) {
    decisionSource = "llm";
  } else if (source.includes("fallback") || source.includes("legacy")) {
    decisionSource = "legacy_fallback";
  }

  const travelRelated = Boolean(input.travelArc || category?.id === "G" || subtype?.id?.startsWith("trv."));
  const workContext = (category?.id === "H") ? "personal" : "work";
  const stakes = raw?.stakes ?? ((raw?.is_high_stakes || category?.id === "A" || category?.id === "J") ? "high" : "medium");

  const dimensions: ItemDimensions = {
    stakes,
    travelRelated,
    workContext,
    durationMinutes,
  };

  const findings: Finding[] = [];
  if (title) {
    findings.push({
      type: "topic",
      value: title,
      family: "text",
      strength: "medium",
      sourceTrust: "user",
      source: "title",
    });
  }

  const reasons = [
    subtype ? `Matched subtype signature for ${subtype.label}` : `Assigned to category ${category?.name ?? "unassigned"}`,
    `Resolved by ${source} with ${confidence} confidence`,
    travelRelated ? "Travel context identified" : "Standard working day rhythm",
  ];

  return {
    itemId,
    sourceType: "calendar",
    category: category?.id ?? null,
    categoryConfidence,
    subtype: subtype?.id ?? null,
    subtypeConfidence,
    bestCandidateSubtype: subtype?.id ?? null,
    confirmationState,
    decisionSource,
    runnerUp: null,
    reasons,
    findings,
    dimensions,
    itemDemand: computeItemDemand(category, subtype, durationMinutes),
    taxonomyVersion: "2026.09.A_J",
    classifierVersion: "v2.5_spine",
    inputHash: `${title}_${durationMinutes ?? 0}`,
    classifiedAt: new Date().toISOString(),
  };
}

