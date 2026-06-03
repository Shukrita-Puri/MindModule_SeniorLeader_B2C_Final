/**
 * Brief prompt-block builders — Wave 1 of the shared-module migration
 * (audit findings F-01 / F-12).
 *
 * Each exported `build<Section>Block` is a PURE function that returns the
 * exact string fragment previously assembled inline in
 * `compute-outer-readiness/index.ts` via `userPrompt += …` chains. The
 * orchestrator now passes typed inputs to these helpers, which centralises:
 *
 *   - block ordering (via `assembleDeterministicBriefBlocks`)
 *   - omission rules (each block returns `''` when its precondition is unmet)
 *   - field formatting (signed deviations, time strings, null fallbacks)
 *
 * Behaviour is intentionally byte-for-byte identical to the prior inline
 * implementation so the LLM sees the same prompt; the only change is where
 * the strings are built.
 *
 * Non-goals: this module does NOT own the async / shared-module sections
 * (STRATEGIC CONTEXT v2 hydration, behaviour snapshot, event coaching,
 * window context). Those continue to live in the orchestrator because they
 * require DB calls or shared modules with their own contracts.
 */

// ───────────────────────────── shared formatting helpers ─────────────────

/** Format a percentage deviation with a leading sign, or 'null'. */
function fmtDeviation(pct: number | null | undefined): string {
  if (pct == null) return 'null';
  return `${pct >= 0 ? '+' : ''}${pct}`;
}

// ───────────────────────────── CONTEXT ───────────────────────────────────

export interface ContextBlockInputs {
  contextHeader: string;          // e.g. `=== CONTEXT: MORNING ===`
  preNotice: string;              // PRE_COMPUTED_USER_NOTICE
  localTimeStr: string;
  timeOfDayStr: string;
  dayName: string;
  isWeekend: boolean;
  isSundayEvening: boolean;
  isMondayMorning: boolean;
  isFridayEvening: boolean;
  isDayBeforeRestDay: boolean;
  isPublicHoliday: boolean;
  holidayName: string | null;
  hoursRemaining: number | null;
}

/** Opening prompt header — always emitted. Returns the full leading string. */
export function buildContextBlock(i: ContextBlockInputs): string {
  return `${i.preNotice}\n\n${i.contextHeader}\nTime: ${i.localTimeStr} · Slot: ${i.timeOfDayStr} · Day: ${i.dayName}\nIs weekend: ${i.isWeekend ? 'yes' : 'no'} · Is Sunday evening: ${i.isSundayEvening ? 'yes' : 'no'} · Is Monday morning: ${i.isMondayMorning ? 'yes' : 'no'}\nIs Friday evening: ${i.isFridayEvening ? 'yes' : 'no'} · Is day before rest day: ${i.isDayBeforeRestDay ? 'yes' : 'no'}\nIs public holiday: ${i.isPublicHoliday ? 'yes' : 'no'}${i.holidayName ? ' · Holiday: ' + i.holidayName : ''}\nHours remaining in workday: ${i.hoursRemaining ?? 'null'}`;
}

// ───────────────────────────── READINESS ─────────────────────────────────

export interface ReadinessBlockInputs {
  innerReadinessScore: number | null;
  safeTier: string | null;
  yesterdayScore: number | null;
  scoreTrend: string | null;
  typicalDOWScore: number | null;
  scoreVsTypicalDOW: string | null;
  dayName: string;
  checkInOutcome: string | null;
  mentalSharpnessLevel: number | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  consecutiveLowDays: number;
  stateShiftToday: boolean;
  stateShiftDirection: string | null;
}

export function buildReadinessBlock(i: ReadinessBlockInputs): string {
  let s = `\n\n=== READINESS ===\nScore: ${i.innerReadinessScore}/100 · Tier: ${i.safeTier} ← reasoning context only, never echo in output\nScore yesterday: ${i.yesterdayScore ?? 'null'} · Trend: ${i.scoreTrend ?? 'stable'}`;
  if (i.typicalDOWScore != null) {
    s += `\nScore vs typical ${i.dayName}: ${i.scoreVsTypicalDOW ?? 'null'}`;
  }
  s += `\nMental Energy (self-declared, /daily-check-in): ${i.checkInOutcome ?? 'null'}`;
  s += `\nMental Sharpness (slider, /check-in-detail): ${i.mentalSharpnessLevel ?? 'null'}/5 · Clarity: ${i.clarityLevel ?? 'null'}/5 · Confidence: ${i.confidenceLevel ?? 'null'}/5`;
  s += `\nEmotional self-declared (Decision Leakage trigger source): ${i.checkInOutcome ?? 'null'}`;
  s += `\nConsecutive low days: ${i.consecutiveLowDays}`;
  if (i.stateShiftToday) {
    s += ` · State shift today: yes · Direction: ${i.stateShiftDirection}`;
  }
  return s;
}

// ───────────────────────────── WEARABLE ──────────────────────────────────

export interface WearableBlockInputs {
  hasWearable: boolean;
  hrvValue: number | null;
  hrvBaseline: number | null;
  hrvDeviation: number | null;
  hrvUnusual: boolean;
  sleepDuration: number | null;   // minutes
  sleepBaseline: number | null;
  sleepScoreVal: number | null;
  sleepDeviation: number | null;
  sleepHardFloor: boolean;
  rhrValue: number | null;
  rhrBaseline: number | null;
  rhrDeviation: number | null;
  hrElevatedFlag: boolean;
  divergenceMode: string | null;
  wearableTrend7d: string | null;
  wearableConfidence: string | null;
}

export function buildWearableBlock(i: WearableBlockInputs): string {
  if (!i.hasWearable) return '';
  let s = `\n\n=== WEARABLE ===`;
  if (i.hrvValue != null) {
    s += `\nHRV: ${i.hrvValue}ms · Baseline: ${i.hrvBaseline ?? 'null'}ms · Deviation: ${fmtDeviation(i.hrvDeviation)}% · Unusual: ${i.hrvUnusual ? 'yes' : 'no'}`;
  }
  if (i.sleepDuration != null) {
    const sleepHrs = (i.sleepDuration / 60).toFixed(1);
    const sleepBaseHrs = i.sleepBaseline ? (i.sleepBaseline / 60).toFixed(1) : 'null';
    s += `\nSleep: ${sleepHrs}hrs · Baseline: ${sleepBaseHrs}hrs · Deviation: ${fmtDeviation(i.sleepDeviation)}% · Below 6hr floor: ${i.sleepHardFloor ? 'yes' : 'no'}`;
  } else if (i.sleepScoreVal != null) {
    s += `\nSleep score: ${i.sleepScoreVal} · Baseline: ${i.sleepBaseline ?? 'null'} · Deviation: ${fmtDeviation(i.sleepDeviation)}%`;
  }
  if (i.rhrValue != null) {
    s += `\nRHR: ${i.rhrValue}bpm · Baseline: ${i.rhrBaseline ?? 'null'}bpm · Deviation: ${fmtDeviation(i.rhrDeviation)}%`;
  }
  s += `\nHeart Rate (elevated proxy): ${i.hrElevatedFlag ? 'yes (sympathetic dominance)' : 'no'}`;
  s += `\nDivergence: ${i.divergenceMode ?? 'null'}`;
  if (i.wearableTrend7d) s += `\nWearable trend (7d): ${i.wearableTrend7d}`;
  s += `\nWearable confidence: ${i.wearableConfidence ?? 'null'}`;
  return s;
}

// ───────────────────────────── CALENDAR TODAY ────────────────────────────

export interface CalendarEventLite {
  title: string;
  minutesUntil: number;
  localHHmm?: string | null;
}

export interface CalendarTodayBlockInputs {
  calendarLoad: string | null;
  todayHighStakes: string[];
  todayHighStakesEventTimes: Array<string | null>;
  totalMeetings: number;
  hasBackToBack: boolean;
  longestBackToBackHrs: number | null;
  nextEventAny: CalendarEventLite | null;
  nextHighStakesEvent: CalendarEventLite | null;
}

export function buildCalendarTodayBlock(i: CalendarTodayBlockInputs): string {
  if (!i.calendarLoad) return '';
  let s = `\n\n=== CALENDAR TODAY ===`;
  s += `\nLoad: ${i.calendarLoad} · High-stakes meetings: ${i.todayHighStakes.length}`;
  if (i.todayHighStakes.length > 0) {
    const paired = i.todayHighStakes.map((t, idx) => {
      const tm = i.todayHighStakesEventTimes[idx];
      return tm ? `${tm} ${t}` : t;
    }).join('; ');
    s += `\nHigh-stakes (local time, title): ${paired}`;
  }
  s += `\nTotal meetings: ${i.totalMeetings ?? 0}`;
  if (i.hasBackToBack) {
    s += `\nBack-to-back: yes · Longest block: ${i.longestBackToBackHrs}hrs`;
  }
  if (i.nextEventAny) {
    const t = i.nextEventAny.localHHmm;
    s += `\nNext event: ${i.nextEventAny.title}${t ? ` at ${t}` : ''} (in ${i.nextEventAny.minutesUntil}mins)`;
  }
  if (i.nextHighStakesEvent) {
    const t = i.nextHighStakesEvent.localHHmm;
    s += `\nNext high-stakes: ${i.nextHighStakesEvent.title}${t ? ` at ${t}` : ''} (in ${i.nextHighStakesEvent.minutesUntil}mins)`;
  }
  s += `\nCLOCK TIME RULE: When referencing any event time in the body, use ONLY the HH:mm strings provided above, character-for-character. Never invent, round, shift, or reformat clock times. If no time is provided for an event, omit the time entirely rather than guessing.`;
  return s;
}

// ───────────────────────────── TOMORROW ──────────────────────────────────

export interface TomorrowBlockInputs {
  show: boolean;                  // (isEvening || isFridayEvening || isSundayEvening) && tomorrowLoad
  tomorrowDayName: string;
  tomorrowLoad: string | null;
  tomorrowHighStakesTitles: string[];
  tomorrowHighStakesEventTimes: Array<string | null>;
  tomorrowFirstMeetingPair: string | null;
  tomorrowVsTodayLoad: string | null;
}

export function buildTomorrowBlock(i: TomorrowBlockInputs): string {
  if (!i.show || !i.tomorrowLoad) return '';
  let s = `\n\n=== TOMORROW ===`;
  s += `\nDay: ${i.tomorrowDayName} · Load: ${i.tomorrowLoad}`;
  if (i.tomorrowHighStakesTitles.length > 0) {
    const paired = i.tomorrowHighStakesTitles.map((t, idx) => {
      const tm = i.tomorrowHighStakesEventTimes[idx];
      return tm ? `${tm}, ${t}` : t;
    }).join(', ');
    s += `\nHigh-stakes meetings (with local times): ${paired}`;
  }
  if (i.tomorrowFirstMeetingPair) {
    s += `\nFirst scheduled meeting: ${i.tomorrowFirstMeetingPair}`;
  }
  if (i.tomorrowVsTodayLoad) {
    s += `\nTomorrow vs today: ${i.tomorrowVsTodayLoad}`;
  }
  return s;
}

// ───────────────────────────── WEEK AHEAD ────────────────────────────────

export interface WeekAheadShape {
  mondayLoad: string | null;
  mondayHasHighStakes: boolean;
  mondayFirstEvent: { title: string; time: string } | null;
  heaviestDay: string | null;
  firstHighStakesDay: string | null;
  totalHighStakesNextWeek: number | null;
  lightDaysNextWeek: string[];
}

export interface WeekAheadBlockInputs {
  show: boolean;                  // Sunday evening only
  weekAhead: WeekAheadShape | null;
}

export function buildWeekAheadBlock(i: WeekAheadBlockInputs): string {
  if (!i.show || !i.weekAhead) return '';
  const wa = i.weekAhead;
  let s = `\n\n=== WEEK AHEAD ===`;
  s += `\nMonday: load ${wa.mondayLoad ?? 'null'} · High-stakes: ${wa.mondayHasHighStakes ? 'yes' : 'no'}`;
  if (wa.mondayFirstEvent) {
    s += `\nMonday first event: ${wa.mondayFirstEvent.title} · ${wa.mondayFirstEvent.time}`;
  }
  s += `\nHeaviest day: ${wa.heaviestDay ?? 'null'}`;
  if (wa.firstHighStakesDay) s += `\nFirst high-stakes: ${wa.firstHighStakesDay}`;
  s += `\nTotal high-stakes next week: ${wa.totalHighStakesNextWeek ?? 0}`;
  if (wa.lightDaysNextWeek?.length > 0) {
    s += ` · Light days: ${wa.lightDaysNextWeek.join(', ')}`;
  }
  return s;
}

// ───────────────────────────── PATTERNS ──────────────────────────────────

export interface PatternsBlockInputs {
  checkInCountTotal: number;
  avgScore7d: number | null;
  scoreTrajectory7d: string | null;
  dominantOutcome7d: string | null;
  wearableTrend7d: string | null;
  practiceCompletionRate: number;
  daysSinceCoachSession: number | null;
  coachSessionImpactDelta: number | null;
  dayName: string;
  typicalDOWOutcome: string | null;
  typicalDOWScore: number | null;
  frictionTrend: string | null;
  hrvEventCorrelation: string | null;
  mostEffectivePractice: string | null;
  serverArchetype: string | null;
  leanOn: string | null;
  watchFor: string | null;
  coachStrength: string | null;
  coachGrowth: string | null;
  pendingCommitment: string | null;
  recentPattern: string | null;
}

export function buildPatternsBlock(i: PatternsBlockInputs): string {
  if (i.checkInCountTotal < 3) return '';
  let s = `\n\n=== PATTERNS ===`;
  if (i.avgScore7d != null) {
    s += `\n7d avg score: ${i.avgScore7d} · Trajectory: ${i.scoreTrajectory7d ?? 'stable'}`;
  }
  if (i.dominantOutcome7d) s += `\nDominant state this week: ${i.dominantOutcome7d}`;
  if (i.wearableTrend7d) s += `\nWearable trend (7d): ${i.wearableTrend7d}`;
  if (i.practiceCompletionRate > 0) {
    s += `\nPractice completion: ${i.practiceCompletionRate}%`;
  }
  if (i.daysSinceCoachSession != null) {
    s += `\nDays since last coach: ${i.daysSinceCoachSession}`;
  }
  if (i.coachSessionImpactDelta != null) {
    s += ` · Coach impact delta: ${i.coachSessionImpactDelta > 0 ? '+' : ''}${i.coachSessionImpactDelta} pts`;
  }

  if (i.checkInCountTotal >= 7) {
    if (i.typicalDOWOutcome) {
      s += `\nTypical ${i.dayName} outcome: ${i.typicalDOWOutcome}${i.typicalDOWScore != null ? ' · Score: ' + i.typicalDOWScore : ''}`;
    }
    if (i.frictionTrend) s += `\nFriction trend (30d): ${i.frictionTrend}`;
    if (i.hrvEventCorrelation) s += `\nHRV correlation: ${i.hrvEventCorrelation}`;
    if (i.mostEffectivePractice) s += `\nMost effective practice: ${i.mostEffectivePractice}`;
  }

  if (i.checkInCountTotal >= 30) {
    if (i.serverArchetype) s += `\nArchetype: ${i.serverArchetype}`;
    if (i.leanOn) s += ` · Lean-on: ${i.leanOn}`;
    if (i.watchFor) s += ` · Watch-for: ${i.watchFor}`;
    if (i.coachStrength) s += `\nCoach strength: ${i.coachStrength}`;
    if (i.coachGrowth) s += `\nCoach growth area: ${i.coachGrowth}`;
    if (i.pendingCommitment) s += `\nPending coach commitment: ${i.pendingCommitment}`;
    if (i.recentPattern) s += `\nRecent coach pattern: ${i.recentPattern}`;
  }
  return s;
}

// ───────────────────────────── ONBOARDING ────────────────────────────────

const ONBOARDING_GOAL_LABELS: Record<string, string> = {
  regulation_composure: 'Composure under pressure',
  regulation_early: 'Early signal detection',
  recovery_resilience: 'Recovery and resilience',
  energy_endurance: 'Energy endurance',
  focus_clarity: 'Focus and clarity',
  mindset_reframe: 'Mindset reframing',
};

export interface OnboardingBlockInputs {
  serverPracticePriorityTag: string | null;
  serverArchetype: string | null;
  leanOn: string | null;
  watchFor: string | null;
  componentScores: {
    energyRegulation?: number;
    focusRecovery?: number;
    energyRenewal?: number;
  } | null;
}

export function buildOnboardingBlock(i: OnboardingBlockInputs): string {
  const parts: string[] = [];
  if (i.serverPracticePriorityTag) {
    parts.push(
      `Goals: ${ONBOARDING_GOAL_LABELS[i.serverPracticePriorityTag] || i.serverPracticePriorityTag}`,
    );
  }
  if (i.serverArchetype) {
    let archLine = `Archetype: ${i.serverArchetype}`;
    if (i.leanOn) archLine += ` · Lean-on: ${i.leanOn}`;
    if (i.watchFor) archLine += ` · Watch-for: ${i.watchFor}`;
    parts.push(archLine);
  }
  if (i.componentScores) {
    const cs = i.componentScores;
    const dims = [
      { name: 'Recalibration', score: cs.energyRegulation || 0 },
      { name: 'Clarity', score: cs.focusRecovery || 0 },
      { name: 'Renewal', score: cs.energyRenewal || 0 },
    ].sort((a, b) => b.score - a.score);
    parts.push(
      `Strength: ${dims[0].name} · Development area: ${dims[dims.length - 1].name}`,
    );
  }
  if (parts.length === 0) return '';
  return `\n\n=== ONBOARDING ===\n${parts.join('\n')}`;
}

// ───────────────────────────── KEY SIGNALS ───────────────────────────────

export function buildKeySignalsBlock(selectedSignals: string[]): string {
  if (!selectedSignals || selectedSignals.length === 0) return '';
  return `\n\n=== KEY SIGNALS ===\n${selectedSignals.join('\n')}`;
}

// ───────────────────────────── GLOBAL & ENVIRONMENTAL LOAD ───────────────

export interface GlobalLoadBlockInputs {
  timezoneOffsetMinutes: number;        // JS Date.getTimezoneOffset semantics (UTC - local)
  effectiveHomeTz: string | null;
  effectiveCurrentTz: string | null;
}

export function buildGlobalLoadBlock(i: GlobalLoadBlockInputs): string {
  const tzHours = Math.round(-i.timezoneOffsetMinutes / 60);
  let s = `\n\n=== GLOBAL & ENVIRONMENTAL LOAD ===`;
  s += `\nUser timezone offset (UTC): ${tzHours >= 0 ? '+' : ''}${tzHours}h`;
  if (
    i.effectiveCurrentTz &&
    i.effectiveHomeTz &&
    i.effectiveCurrentTz !== i.effectiveHomeTz
  ) {
    s += `\nTraveling: home ${i.effectiveHomeTz}, currently ${i.effectiveCurrentTz} (all event times above are in CURRENT zone)`;
  } else {
    s += `\nTravel/circadian drift: none`;
  }
  s += `\nExternal market/macro pressure: null (not instrumented)`;
  return s;
}

// ─────────────────── STRATEGIC CONTEXT (deterministic head) ──────────────
//
// The full STRATEGIC CONTEXT section interleaves an async DB hydration
// (daily_context_snapshot → composeDailyContext fallback) with pure derivation.
// The pure prelude (postPeakWindow + isHighVisibilityToday flags + header)
// can be built here; the orchestrator appends the v2 pattern_signals /
// strategic_context lines after its async fetch.

const HIGH_VISIBILITY_REGEX =
  /\b(board|town hall|townhall|investor|all-hands|allhands|earnings|press|keynote)\b/i;

export interface StrategicContextHeadInputs {
  todayHighStakes: string[];
  nextHighStakesEvent: CalendarEventLite | null;
}

export interface StrategicContextHeadOutput {
  block: string;
  postPeakWindow: boolean;
  isHighVisibilityToday: boolean;
}

export function buildStrategicContextHead(
  i: StrategicContextHeadInputs,
): StrategicContextHeadOutput {
  const postPeakWindow =
    i.todayHighStakes.length > 0 &&
    !!i.nextHighStakesEvent &&
    i.nextHighStakesEvent.minutesUntil < 0 &&
    Math.abs(i.nextHighStakesEvent.minutesUntil) <= 180;
  const isHighVisibilityToday = i.todayHighStakes.some((t) =>
    HIGH_VISIBILITY_REGEX.test(t),
  );
  const block =
    `\n\n=== STRATEGIC CONTEXT ===` +
    `\npostPeakWindow: ${postPeakWindow ? 'yes' : 'no'}` +
    `\nisHighVisibilityToday: ${isHighVisibilityToday ? 'yes' : 'no'}`;
  return { block, postPeakWindow, isHighVisibilityToday };
}

// ───────────────────────────── TRIANGULATION ─────────────────────────────

export interface TriangulationBlockInputs {
  crossHorizonConnection: string | null;
  immediateSignal: string | null;
  tacticalSignal: string | null;
  strategicSignal: string | null;
  connectionFraming: string | null;
  dominantHorizon: string | null;
}

export function buildTriangulationBlock(i: TriangulationBlockInputs): string {
  if (!i.crossHorizonConnection) return '';
  let s = `\n\n=== TRIANGULATION ===`;
  if (i.immediateSignal) s += `\nNow: ${i.immediateSignal}`;
  if (i.tacticalSignal) s += `\nPattern: ${i.tacticalSignal}`;
  if (i.strategicSignal) s += `\nDevelopment: ${i.strategicSignal}`;
  s += `\nConnection: ${i.crossHorizonConnection}, ${i.connectionFraming}`;
  s += `\nLead with: ${i.dominantHorizon}`;
  return s;
}

// ───────────────────────────── WINDOW CONTEXT (summariser) ───────────────
//
// Pure summariser for the WindowContext shape returned by
// `_shared/signal-engine/*-context` builders. The orchestrator owns the
// async build (`buildWindowContext(...)`); this helper owns the prompt
// projection so the formatting lives next to the other deterministic blocks.

export interface WindowContextLike {
  window: 'morning' | 'afternoon' | 'evening';
  // morning
  yesterdayLoad?: string | number;
  yesterdayLoadScore?: number;
  yesterdayHadHighStakes?: boolean;
  sleepQuality?: string | null;
  todayMeetingCount?: number;
  todayFirstHighStakes?: { title: string } | null;
  vetoRisk?: boolean;
  // afternoon
  meetingsCompleted?: number;
  meetingsRemaining?: number;
  highestRemainingStakes?: { title: string } | null;
  backToBackRemainingHours?: number;
  decisionLeakageRisk?: boolean;
  jitEventsRemaining?: number;
  // evening
  mode?: string;
  todayCompletedCount?: number;
  todayHadHighStakes?: boolean;
  bodyLoadElevated?: boolean;
  recoveryNote?: string;
  tomorrowFirstHighStakes?: { title: string } | null;
  tomorrowIsHeavy?: boolean;
  jitRemainingEvening?: boolean;
}

export function buildWindowContextBlock(w: WindowContextLike | null | undefined): string {
  if (!w) return '';
  let s = `\n\n=== WINDOW CONTEXT (${w.window}) ===`;
  if (w.window === 'morning') {
    s += `\nyesterday_load: ${w.yesterdayLoad} (score ${w.yesterdayLoadScore})`;
    s += `\nyesterday_had_high_stakes: ${w.yesterdayHadHighStakes ? 'yes' : 'no'}`;
    s += `\nsleep_quality: ${w.sleepQuality ?? 'unknown'}`;
    s += `\ntoday_meeting_count: ${w.todayMeetingCount}`;
    if (w.todayFirstHighStakes) {
      s += `\ntoday_first_high_stakes: ${w.todayFirstHighStakes.title}`;
    }
    if (w.vetoRisk) s += `\nveto_risk: yes`;
  } else if (w.window === 'afternoon') {
    s += `\nmeetings_completed: ${w.meetingsCompleted}`;
    s += `\nmeetings_remaining: ${w.meetingsRemaining}`;
    if (w.highestRemainingStakes) {
      s += `\nhighest_remaining_stakes: ${w.highestRemainingStakes.title}`;
    }
    if ((w.backToBackRemainingHours ?? 0) > 0) {
      s += `\nback_to_back_remaining_hours: ${w.backToBackRemainingHours}`;
    }
    if (w.decisionLeakageRisk) s += `\ndecision_leakage_risk: yes`;
    if ((w.jitEventsRemaining ?? 0) > 0) {
      s += `\njit_events_remaining: ${w.jitEventsRemaining}`;
    }
  } else if (w.window === 'evening') {
    s += `\nmode: ${w.mode}`;
    s += `\ntoday_completed_count: ${w.todayCompletedCount}`;
    s += `\ntoday_had_high_stakes: ${w.todayHadHighStakes ? 'yes' : 'no'}`;
    if (w.bodyLoadElevated) s += `\nbody_load_elevated: yes`;
    s += `\nrecovery_note: ${w.recoveryNote}`;
    if (w.tomorrowFirstHighStakes) {
      s += `\ntomorrow_first_high_stakes: ${w.tomorrowFirstHighStakes.title}`;
    }
    if (w.tomorrowIsHeavy) s += `\ntomorrow_is_heavy: yes`;
    if (w.jitRemainingEvening) {
      s += `\njit_remaining_evening: yes (Close framing suppressed; finish JIT prep before close)`;
    }
  }
  return s;
}

// ───────────────────────────── ASSEMBLER ─────────────────────────────────

/**
 * Single typed inputs bag for the deterministic Brief prompt blocks.
 * The orchestrator builds this from its locals and calls
 * `assembleDeterministicBriefBlocks` to get a string fragment that
 * concatenates CONTEXT → READINESS → WEARABLE → CALENDAR TODAY →
 * TOMORROW → WEEK AHEAD → PATTERNS → ONBOARDING → KEY SIGNALS →
 * GLOBAL & ENVIRONMENTAL LOAD → STRATEGIC CONTEXT (head) → TRIANGULATION
 * in the canonical order. The orchestrator appends the async / shared-
 * module sections (STRATEGIC CONTEXT v2 hydration, behaviour snapshot,
 * event coaching, window context) afterwards.
 */
export interface BriefDeterministicInputs {
  context: ContextBlockInputs;
  readiness: ReadinessBlockInputs;
  wearable: WearableBlockInputs;
  calendarToday: CalendarTodayBlockInputs;
  tomorrow: TomorrowBlockInputs;
  weekAhead: WeekAheadBlockInputs;
  patterns: PatternsBlockInputs;
  onboarding: OnboardingBlockInputs;
  keySignals: string[];
  globalLoad: GlobalLoadBlockInputs;
  strategic: StrategicContextHeadInputs;
  triangulation: TriangulationBlockInputs;
}

export interface AssembledBriefBlocks {
  /** Concatenated prompt fragment, in canonical order. */
  text: string;
  /** Flags surfaced from the STRATEGIC CONTEXT head, exposed for callers
   *  that want to log or branch on them without re-deriving. */
  postPeakWindow: boolean;
  isHighVisibilityToday: boolean;
}

export function assembleDeterministicBriefBlocks(
  i: BriefDeterministicInputs,
): AssembledBriefBlocks {
  const strategicHead = buildStrategicContextHead(i.strategic);
  const parts: string[] = [
    buildContextBlock(i.context),
    buildReadinessBlock(i.readiness),
    buildWearableBlock(i.wearable),
    buildCalendarTodayBlock(i.calendarToday),
    buildTomorrowBlock(i.tomorrow),
    buildWeekAheadBlock(i.weekAhead),
    buildPatternsBlock(i.patterns),
    buildOnboardingBlock(i.onboarding),
    buildKeySignalsBlock(i.keySignals),
    buildGlobalLoadBlock(i.globalLoad),
    strategicHead.block,
    buildTriangulationBlock(i.triangulation),
  ];
  return {
    text: parts.join(''),
    postPeakWindow: strategicHead.postPeakWindow,
    isHighVisibilityToday: strategicHead.isHighVisibilityToday,
  };
}