// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// Shared Typed & Versioned Spine Vocabularies.
// Source: Knowledge & Memory Spine (Sections 9, 11), Part 4 Tree (C5, C6, C7).

// ── 1. Five Kinds of Memory (Spine Decision 39) ──────────────────────
export const MEMORY_KINDS = [
  "declared",     // Explicit statements by user (onboarding, corrections, preferences)
  "observed",     // Hardware sensor readings, raw calendar items, GPS fixes, arithmetic on facts
  "behavioural",  // In-app user actions (practices done/skipped, briefs read, nudges dismissed)
  "pattern",      // Multi-day statistical findings from Layer 4 (≥3 occurrences across 365d)
  "inferred",     // Algorithmic deduction (classifications, day character, synthesized profile)
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

// ── 2. Five Correction Scopes (Spine Section 9.3) ─────────────────────
// Evaluation precedence: narrowest wins (this event -> this series -> pattern -> person -> org).
export const CORRECTION_SCOPES = [
  "THIS_EVENT",     // Specific calendar occurrence instance
  "THIS_SERIES",    // Entire recurring series (seriesMasterId / recurringEventId)
  "TITLE_PATTERN",  // Normalized title prefix / keyword match
  "PERSON",         // Specific attendee email
  "ORGANISATION",   // Specific company email domain
] as const;

export type CorrectionScope = (typeof CORRECTION_SCOPES)[number];

// ── 3. Four Memory Tiers (Spine Section 9.1) ──────────────────────────
export const MEMORY_TIERS = [
  "tier0_working",  // Single request in-memory bundle
  "tier1_today",    // Current local day (snapshots, ritual ledger, checkins, notification log)
  "tier2_recent",   // 7 to 365 days (baselines, calendar stamps, causality findings, travel)
  "tier3_longterm", // Account lifetime (profile, declared goals, corrections, confirmed relations)
] as const;

export type MemoryTierNamed = (typeof MEMORY_TIERS)[number];
export type MemoryTierNumeric = 0 | 1 | 2 | 3;
export type MemoryTier = MemoryTierNamed | MemoryTierNumeric;

// ── 4. Relationship Role Vocabulary (15 Canonical Roles) ─────────────
export const RELATIONSHIP_ROLES = [
  "board_chair",
  "board_member",
  "investor",
  "chief_of_staff",
  "executive_assistant",
  "direct_report",
  "team_member",
  "external_peer",
  "customer",
  "vendor_partner",
  "candidate",
  "advisor_mentor",
  "regulator",
  "media_press",
  "family_friend",
] as const;

export type RelationshipRole = (typeof RELATIONSHIP_ROLES)[number];

// ── 5. Circadian Windows ──────────────────────────────────────────────
export const CIRCADIAN_WINDOWS = ["morning", "afternoon", "evening"] as const;
export type CircadianWindow = (typeof CIRCADIAN_WINDOWS)[number];

// ── 6. Temporal Phases ────────────────────────────────────────────────
export const TEMPORAL_PHASES = ["pre", "during", "post"] as const;
export type TemporalPhase = (typeof TEMPORAL_PHASES)[number];

// ── 7. Day Frames (Layer 2 Context) ──────────────────────────────────
export const DAY_FRAMES = [
  "standard_workday",
  "dense_workday",
  "light_workday",
  "travel_day",
  "conference_day",
  "crisis_day",
  "weekend",
  "public_holiday",
  "vacation_leave",
] as const;

export type DayFrame = (typeof DAY_FRAMES)[number];

// ── 8. Intervention Needs (Layer 3 Interventions - 15 Canonical Needs) ─
export const INTERVENTION_NEEDS = [
  "somatic_pause",
  "cognitive_clarity",
  "re_energize",
  "circadian_anchor",
  "post_peak_reset",
  "defuse_hijack",
  "emotional_containment",
  "focus_lock",
  "flight_reentry",
  "light_touch_cadence",
  "morning_mindset",
  "evening_decompression",
  "decision_audit",
  "vitality_boost",
  "grounding_presence",
] as const;

export type InterventionNeed = (typeof INTERVENTION_NEEDS)[number];
