// OWNERSHIP: engineering. This is the typed API contract between the deterministic
// CEO behaviour layer and every consumer (brief, smart-nudges, generate-mastery-plan,
// generate-jit-events). Field shape changes go through code review only — do not
// edit in a chat-driven session without an explicit human request.
//
// See mem/features/performance-readiness/prompt-snapshot-brief.md for context on
// what moved out of the LLM prompt into this contract.

export type PillarCluster = "cognition" | "physiology" | "resilience";

import type { Protocol, ProtocolMode } from "./protocols/protocol-combos.ts";

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
  // --- Part 1: same-day round-trip arc (Oxford↔London, etc.)
  | "travelDayArrivalFraming"
  | "travelDayDuringPushOnly"
  | "travelDayReturnRecovery"
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
  | "nudgeBatchOnReturn"
  // --- Conference / Summit cluster (v2 expansion)
  | "conferenceNightBeforeSummit"
  | "conferenceDayAttend"
  | "conferenceDayWithSpeaking"
  | "dropInSpeakingHighStakes"
  | "conferenceMidSessionReset"
  | "conferenceCarryFatigue"
  | "postConferenceReentry"
  // --- Coverage expansion (Part 1): seven CEO domains as first-class behaviours
  | "influencePersuasionPrep"     // category B — negotiation, fundraise pitch, investor pitch, sales pitch
  | "visibilityCommsPrep"         // category C — keynote, media, all-hands, press
  | "deepWorkProtection"          // category E — deep work / strategy block ≥90min
  | "morningBaseline"             // daily rhythm — first 60min after wake, no high-stakes
  | "eveningShutdown"             // daily rhythm — end-of-work-day shutdown ritual
  | "postGovernanceOffload";      // post-board / investor / earnings offload window

export type Severity = "low" | "medium" | "high";

/** Which surface a rule is allowed to fire on. */
export type RuleScope = "brief" | "nudge" | "plan";

/** A rule + the surfaces it applies to. Used by behaviour-evaluator. */
export interface ScopedRule {
  /**
   * Stable identifier — defaults to the rule function name. Used by the
   * registry contract test and (optionally) by slot-boost lookups so consumers
   * never enumerate rule names by hand.
   */
  id?: string;
  scopes: readonly RuleScope[];
  fn: (ctx: RuleContext) => BehaviourFlag | null;
  /**
   * Optional plan-side slot-boost descriptor. When present, the behaviour
   * evaluator emits a SlotBoost any time this rule fires at the listed
   * severities. Replaces the legacy hardcoded if/else cascade in
   * `deriveSlotBoosts` — adding a new rule with a boost descriptor wires it
   * into the Plan automatically.
   */
  slotBoost?: {
    slot: SlotBoost["slot"];
    practiceType: SlotBoost["practiceType"];
    /** Severities that should produce a boost. Defaults to ["high"]. */
    severities?: ReadonlyArray<Severity>;
  };
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
  /**
   * Part 1 (travel landing split): how smart-nudges should deliver this flag.
   *   - 'push_only'       → no deep-link CTA; single in-body cue.
   *   - 'in_app_practice' → deep-link to Plan / practice allowed.
   *   - 'standard'        → default delivery behaviour.
   * Consumers that don't recognise the field treat it as 'standard'.
   */
  landingDeliveryMode?: 'in_app_practice' | 'push_only' | 'standard';
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

  // --- Part 1: travel load split -------------------------------------------
  /** User is currently away from home (travel_state.state ∈ {en_route, arrived,
   *  returning} OR distance_from_home_km > TRAVEL_AWAY_MIN_KM). Defaults to
   *  undefined when no travel_state row is hydrated; rules MUST treat
   *  undefined as "assume away" for back-compat. */
  awayFromHome?: boolean;
  /** Today contains both an outbound and a return travel event whose local
   *  start dates match (same calendar day). */
  sameDayReturn?: boolean;
  /** Tier classification driven by classifyTravelTier(). */
  travelTier?: 'long_haul' | 'short_haul' | 'short_haul_round_trip';

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

  /** Inferred personal (non-work) holiday/vacation today. Derived in
   *  brief-signal-coverage from the canonical PTO/holiday regex restricted
   *  to personal-leaning markers (vacation / annual leave / on leave /
   *  public|bank|national holiday). Edge may override with richer context. */
  personalHolidayInferred?: boolean;

  /** Inferred work-travel day today: a travel event is present AND a
   *  high-stakes meeting is scheduled within the next 24h. Distinguishes
   *  business trips from personal travel so travel-arc framing can pivot. */
  workTravelInferred?: boolean;

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

  // ---------------------------------------------------------------------------
  // Conference / Summit cluster (v2). All optional / nullable. Mechanical fields
  // populated by brief-signal-coverage.ts; user-tag fields written by Edge.
  // ---------------------------------------------------------------------------

  /** Day number within a multi-day conference chain spanning today. null when
   *  today is not a conference day. */
  conferenceDayNumber?: number | null;
  /** Day number within a multi-day chain that ended YESTERDAY (used by
   *  postConferenceReentry). null when yesterday was not the last day. */
  conferenceDayNumberYesterday?: number | null;
  /** Total days in the inferred conference chain. */
  conferenceTotalDays?: number | null;
  /** Normalized title of the conference chain spanning today (or tomorrow when
   *  conferenceStartsTomorrow). Used purely for copy framing. */
  conferenceEventTitle?: string | null;
  /** Speaking sub-blocks on today's calendar, classified by regex. */
  speakingBlocksToday?: Array<{
    title: string;
    minutesUntil: number;
    durationMinutes: number | null;
    kind: "panel" | "fireside" | "keynote" | "talk" | "moderator" | "qa" | "other";
  }>;
  /** True when today has an all-day OR ≥4h block matching CONFERENCE_RX. */
  hasFullDayConferenceWrapper?: boolean;
  /** Minutes between today's first and second timed session. null when <2. */
  firstSessionGapMinutesToday?: number | null;
  /** Conference days observed in the trailing 4 days (excluding today). */
  conferenceDaysInTrailing4?: number;
  /** Composite load: trailing conference days × next-3-day meeting density. */
  trailingConferenceLoad?: "low" | "medium" | "high";
  /** Distinct meetings scheduled in the next 3 days (excluding all-day). */
  nextThreeDaysMeetingCount?: number | null;
  /** Tomorrow is Day 1 of a multi-day conference chain AND today is not. */
  conferenceStartsTomorrow?: boolean;

  /** Count of timed non-speaking, non-wrapper meetings on a conference day.
   *  Proxies active social/cognitive engagement *parallel* to the summit
   *  (people-meetings inside the venue OR external meetings clocked in
   *  alongside the event). Drives severity for `conferenceDayAttend` — a
   *  pure attend-only "exploring & learning" day has 0; anything ≥1
   *  promotes severity beyond the day-count amplifier. */
  conferenceParallelMeetingsToday?: number;

  // --- Triangulation (Edge writes; .ts only reads) ---
  /** User explicitly tagged today as a conference day. Overrides regex miss. */
  userTaggedConferenceToday?: boolean;
  /** User explicitly tagged a speaking commitment today. */
  userTaggedSpeakingToday?: boolean;
  /** Reserved post-MVP — social/sensory stim load is high today. */
  conferenceSocialLoadHigh?: boolean;
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
    /** §3 category from the canonical event taxonomy (enrichEvent.categoryId). */
    categoryId?: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | null;
    /** True when the event title classifies as interpersonal (1:1, review,
     *  difficult conversation, layoff, HR, conflict). Set upstream by the
     *  event classifier — never inline-detect from title in a rule. */
    isInterpersonal?: boolean;
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
  /**
   * Canonical availability decision. When present, rules MUST prefer this
   * over legacy `signals.ptoTodayAllDay` / `holidayAllDayEventToday`. The
   * classifier lives at `_shared/availability/availability-classifier.ts`
   * and is the single source of truth for "is the user actually working
   * today?". Legacy fields are retained for backward compatibility with
   * consumers that have not yet migrated. Populated automatically by
   * `buildRuleContext` when country / event data is available.
   */
  availability?: {
    state: 'WORKDAY' | 'LIGHT_ROUTINE' | 'REST_DAY' | 'PTO' | 'PUBLIC_HOLIDAY';
    isRestDay: boolean;
    workEvidence: { meetingCount: number; hasWorkMeetings: boolean };
    holiday: {
      detected: boolean;
      applicable: boolean;
      title?: string;
      scope?: string;
    };
    reason: string;
  };
}