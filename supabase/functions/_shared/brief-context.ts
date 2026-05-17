// OWNERSHIP: engineering. This is the typed API contract between the deterministic
// CEO behaviour layer and every consumer (brief, smart-nudges, generate-mastery-plan,
// generate-jit-events). Field shape changes go through code review only — do not
// edit in a chat-driven session without an explicit human request.
//
// See mem/features/performance-readiness/prompt-snapshot-brief.md for context on
// what moved out of the LLM prompt into this contract.

export type PillarCluster = "cognition" | "physiology" | "resilience";

import type { Protocol, ProtocolMode } from "./event-protocol-taxonomy.ts";

export type BehaviourRule =
  | "vetoRisk"
  | "secondWind"
  | "circadianPriority"
  | "decisionLeakageGuard"
  | "postPeakHangover"
  | "personalFrictionInference"
  | "boardLevelOutcome"
  | "sundayReset"            // §5.2 — all three surfaces
  | "notificationIsProduct"  // §5.2 — nudge only
  | "conferenceDepletion"    // stub now, lights up when schema lands
  // --- Batch 2: weekend cluster (sub-case ladder)
  | "weekendMorningLightTouch"
  | "weekendWithMeeting"
  | "fullWorkingWeekend"
  | "weekendDeepWorkBlock"
  | "sundayEveningWeekAhead"
  // --- Batch 2: pto/holiday cluster
  | "holidayReducedTouch"
  | "ptoWithMeetingFallback"
  // --- Batch 2: travel cluster (overrides every other cluster)
  | "travelPreFlightMandatory"
  | "travelLandingOffload"
  | "travelLandingPlusHighStakes"
  | "longHaulRecovery"
  | "postTripReentry"
  // --- Batch 2: high-stakes prep (24h cap, MVP)
  | "advancePrep24h"
  // --- Batch 2: back-to-back + meeting-prep cliff
  | "backToBackLoadOverride"
  | "meetingPrepCliff"
  // --- Batch 2: multi-calendar load aggregation
  | "multiCalendarLoad"
  // --- Batch 3: decision density
  | "decisionDensity"
  // --- Batch 3 stubs (lock API surface; return null until detectors land)
  | "interpersonalMeetingContext"
  | "emptySlotProtection"
  | "upwardReporting"
  | "stackedStakes"
  | "crisisInjection"
  | "contextSwitchingCost"
  | "preEventSleepTarget"
  | "timeSinceLastRecovery"
  // --- Batch 4: decision-leakage 24h tail (plan-only) + connection leg
  | "decisionLeakageGuardPlan"
  | "travelInFlightConnection"
  // --- Batch 4: delivery cluster (nudge-only)
  | "nudgeDeferOffline"
  | "nudgeSuppressDND"
  | "nudgeStaleSkip"
  | "nudgeBatchOnReturn";

export type Severity = "low" | "medium" | "high";

/** Which surface a rule is allowed to fire on. */
export type RuleScope = "brief" | "nudge" | "plan";

/** A rule + the surfaces it applies to. Used by behaviour-evaluator. */
export interface ScopedRule {
  scopes: readonly RuleScope[];
  fn: (ctx: RuleContext) => BehaviourFlag | null;
}

/**
 * Output of a single rule in ceo-behaviour-rules.ts.
 *
 * `copyHint` is the load-bearing field: it replaces the §2.11–§2.17 prose in the
 * LLM prompt. The LLM stops re-evaluating booleans under generation pressure and
 * just executes craft + constraint.
 */
export interface BehaviourFlag {
  rule: BehaviourRule;
  severity: Severity;
  /** Concrete signal tokens that triggered the rule, e.g. ["HRV -22%", "sleep 5h40m"]. */
  evidence: string[];
  /** Verbatim calendar event title the rule binds to, if any. */
  anchorEvent?: string;
  /** Leadership Variable from the Elastic Lexicon (e.g. "Executive Presence"). */
  stake?: string;
  /**
   * Framing instruction for the LLM. Example: "name the mask, tie to board call".
   * The LLM uses this to set tone — it must NOT quote it verbatim.
   */
  copyHint: string;
}

/**
 * Suggested slot boost for the Plan. Consumed by `generate-mastery-plan` only.
 * Brief and nudges ignore this field. Severity drives boost magnitude.
 */
export interface SlotBoost {
  slot: "start_of_day" | "midday" | "end_of_day";
  practiceType: "regulate" | "align" | "prepare" | "integrate";
  reason: BehaviourRule;
  severity: Severity;
  /** Preferred §2 protocol — derived from practiceType via PRACTICE_TYPE_TO_COMBO. */
  protocol?: Protocol;
  /** Preferred §2 mode — derived from practiceType via PRACTICE_TYPE_TO_COMBO. */
  mode?: ProtocolMode;
}

/**
 * Compact view of the §3 Signal Coverage Matrix needed by rules + LLM.
 * Built by `brief-signal-coverage.ts`. Only fields the rules read are required;
 * everything else stays in the original prompt blocks for now.
 */
export interface SignalMatrix {
  // §3 Wearable
  hrvDeviationPct: number | null;       // negative = below baseline
  hrvUnusual: boolean;
  sleepHours: number | null;
  sleepDeviationPct: number | null;
  sleepBelow6h: boolean;
  rhrDeviationPct: number | null;       // positive = elevated
  hrElevatedProxy: boolean;

  // §3.11 Emotional triangulation
  emotionalSelfDeclared: string | null; // "depleted" | "managing" | "neutral" | …
  mentalSharpness: number | null;       // 1–5
  confidence: number | null;            // 1–5

  // §3.12 Global / environmental load
  timezoneOffsetMinutes: number | null;
  timezoneShift48hHours: number | null;
  travelDay: boolean;

  // §3.13 Strategic context (derived)
  yesterdayScore: number | null;
  todayScore: number | null;
  postPeakWindow: boolean;              // yesterday ≥75 AND today recovery deficit
  isHighVisibilityToday: boolean;       // board/external/investor in next 24h

  // §2.14 Decision Leakage support — calendar
  emotionalDrainEventInNext4h: { title: string; minutesUntil: number } | null;

  // §2.17 Board-Level Outcome support — calendar
  highStakesEventInNext24h: { title: string; minutesUntil: number } | null;

  // §2.12 Second Wind support
  morningWasCompressed: boolean;
  middayRecoveryDetected: boolean;

  // §2.15 Post-Peak Hangover support
  clarityDropFromTrailingAvg: number | null; // negative = drop

  // --- Batch 1: reserved fields for Batches 2/3. All optional, default null/false.
  //     No rule reads these in Batch 1; types added now so consumers don't churn.

  /** Travel cluster — landing detection. Native bridge → telecom signal; null until shipped. */
  foreignTelecomDetected?: boolean;
  /** Travel cluster — composite: telecom OR calendar-end travel event ended ≤60min ago. */
  travelLandingDetected?: boolean;
  /** Long-haul flag (duration ≥3h) — populated by brief-signal-coverage when known. */
  longHaulFlight?: { durationHours: number } | null;
  /** Yesterday was a travel day AND next-day calendar density is medium/high. */
  postTripReentryRisk?: boolean;

  /** PTO / public holiday — all-day event whose title matches OOO|PTO|Vacation|Holiday|Out of Office. */
  ptoTodayAllDay?: boolean;

  /** Weekend cluster — at least one event today whose stakesLevel is set OR title is high-stakes. */
  hasWorkMeetingOnWeekend?: boolean;
  /** Weekend cluster — large block (≥90min) whose title matches WORK_BLOCK_RX. */
  weekendWorkBlockToday?: { title: string; startMinutesFromNow: number; durationMinutes: number } | null;
  /** Weekend cluster — total meetings spread across today (used for "full working weekend"). */
  weekendMeetingCountToday?: number;

  /** Multi-calendar cluster — distinct sources contributing to today's events (after dedupe). */
  calendarSources?: string[];
  /** Multi-calendar cluster — aggregated back-to-back hours across sources (post-dedupe). */
  backToBackHoursAggregated?: number | null;

  /** Decision density cluster (Batch 3) — rolling 4h score. */
  decisionDensityScore?: number | null;
  decisionDensityWindow?: "next-4h" | null;

  // ---------------------------------------------------------------------------
  // Batch 4 additive fields. All optional / nullable. No rule reads these until
  // its cluster file is updated. See mem/architecture/ceo-behaviour-shared-
  // module-ownership.md §"Phase 2 / Batch 4 boundary" for the contract.
  // ---------------------------------------------------------------------------

  // --- Travel shape (mechanical, populated by brief-signal-coverage) ---
  /** Minutes until the FIRST travel event of the day. null unless 60–240. */
  preFlightWindowMinutes?: number | null;
  /** Minutes until the *connecting* leg of multi-leg travel. Set only when the
   *  layover is short enough to be a true connection (i.e. WiFi-only in-flight
   *  self-regulation window). Long gaps fall through to high-stakes prep or
   *  remain silent (personal/PTO). Populated by Edge — triangulation. */
  inFlightConnectionMinutes?: number | null;
  /** Title of the next travel event (used for copy framing). */
  nextTravelEventTitle?: string | null;
  /** True if yesterday was a travel day. Used by postTripReentry copy. */
  yesterdayWasTravelDay?: boolean;

  // --- Day-shape (mechanical) ---
  /** Today resolves to an away-day / OOO calendar mode. */
  ptoModeToday?: boolean;
  /** A meeting is scheduled inside the PTO day (override → ptoWithMeetingFallback). */
  ptoMeetingPresent?: boolean;

  // --- Triangulation-populated (Edge writes; .ts only reads) ---
  /** "sun-pm" | "mon-am" | null. Edge sets when its triangulation
   *  (mood × wearable-absence × calendar) concludes personal-friction window. */
  personalFrictionWindow?: "sun-pm" | "mon-am" | null;
  /** Drain event within next 24h (broader than next-4h variant used by
   *  decisionLeakageGuard). Powers the plan-scope rule. */
  emotionalDrainEventInNext24h?: { title: string; minutesUntil: number } | null;

  // --- Delivery shape (nudge-cluster only; Edge populates from device telemetry) ---
  /** Device connectivity state. null = unknown. */
  deviceOnline?: boolean | null;
  /** Do-Not-Disturb is currently active. */
  dndActive?: boolean;
  /** Minutes until DND ends. null when not in DND. */
  dndEndsInMinutes?: number | null;
  /** Airplane mode currently active on the device. */
  airplaneModeActive?: boolean;
  /** Minutes since device was last seen online. */
  lastSeenOnlineMinutesAgo?: number | null;
}

/**
 * The full payload the LLM and downstream consumers see.
 * Serialised as JSON into the slim brief prompt Block 2.
 */
export interface BriefContext {
  signals: SignalMatrix;
  behaviourFlags: BehaviourFlag[];      // sorted by severity desc, deduped by rule
  lexiconClusters: PillarCluster[];     // which clusters the body must touch
  forbiddenWords: string[];             // copy-vocabulary single source of truth
  allowedPatternKeywords: string[];     // gates §2.19.1 pattern reference
  suggestedSlotBoosts?: SlotBoost[];    // Plan consumes; brief + nudges ignore
}

/**
 * Minimal input every rule needs. Built per-request by the consumer from its
 * existing fetched signals — we deliberately keep this narrower than the full
 * brief context so rules stay testable in isolation.
 */
export interface RuleContext {
  signals: SignalMatrix;
  // Calendar pre-filtered into the two narrow slices the rules need.
  upcomingEvents: Array<{
    title: string;
    minutesUntil: number;
    stakesLevel?: string | null;
    isEmotionalDrain?: boolean;
    // Batch 2/3 extensions — all optional, populated when source exposes them.
    attendeeCount?: number;
    durationMinutes?: number;
    source?: string;
    startsAtMinutesFromNow?: number;
    endsAtMinutesFromNow?: number;
  }>;
  // Local hour at the user's timezone, used by §2.12 (midday window).
  localHour: number;
  /** 0 = Sunday … 6 = Saturday, in user's local timezone. */
  dayOfWeek?: number;
  /** Total hours of back-to-back meetings scheduled today. */
  backToBackHoursToday?: number;
  /** Trailing 7-day app-open rate falls below threshold (set upstream). */
  historicalAppOpenRateLow?: boolean;
  /** Day number within a multi-day conference (1 = day 1). Undefined until schema lands. */
  conferenceDayNumber?: number;

  // --- Batch 1 reserved — all optional, no rule reads these in Batch 1.
  /** Meeting prep cliff (Batch 2). Gap to next high-stakes event in {5,15,30} buckets. */
  nextPreEventGap?: { gapMinutes: number; nextEventTitle: string; nextEventStakes: string | null } | null;
  /** PTO/Holiday cluster (Batch 2). All-day OOO/PTO/Vacation/Holiday event today. */
  holidayAllDayEventToday?: { title: string } | null;
  /** Travel cluster (Batch 2). End of last travel event (calendar-source landing signal). */
  lastTravelEventEndedMinutesAgo?: number | null;
  /** Crisis injection (Batch 3 stub). User-flagged unplanned high-stakes event. */
  crisisEvent?: { title: string; minutesUntil: number } | null;
  /** Time since last completed practice — for timeSinceLastRecovery stub (Batch 3). */
  minutesSinceLastPractice?: number | null;
}