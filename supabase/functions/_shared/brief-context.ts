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
  | "conferenceDepletion";   // stub now, lights up when schema lands

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
}