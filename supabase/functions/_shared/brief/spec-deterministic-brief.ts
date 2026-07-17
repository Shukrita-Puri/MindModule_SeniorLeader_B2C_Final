/**
 * Spec-compliant deterministic Brief fallback.
 *
 * Built from DETERMINISTIC_FALLBACK_SAME_SIGNAL_FINAL.md spec.
 * Reads from the SAME in-scope variables the LLM received.
 * Output MUST pass validateBrief() before being served.
 *
 * Architecture: Same Input, Different Processor
 *   Signal Assembly (already run) → LLM path (failed) → THIS path (template consumer)
 *   Both paths validated by the same validators.
 */

import type { AssessmentContext } from "../signal-pills/assessment-context.ts";

// ──────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────

export type BandKey = 'high' | 'mid' | 'low';

export type TopSignal =
  | 'hr_event_correlation'
  | 'wearable_x_calendar'
  | 'imminent_high_stakes'
  | 'calendar_heavy'
  | 'sleep_deficit'
  | 'hrv_deficit'
  | 'checkin_signal'
  | 'declining_trajectory'
  | 'tomorrow_heavy'
  | 'baseline_quiet';

export interface SpecDeterministicParams {
  // Band — from the SAME getReadinessValence() the LLM system prompt used
  bandValence: BandKey | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening';

  // Wearable — SAME variables as === WEARABLE === block
  hasWearable: boolean;
  hrvDeviation: number | null;
  sleepDuration: number | null;      // minutes
  sleepDeviation: number | null;     // percent
  sleepHardFloor: boolean;           // < 360 min
  rhrDeviation: number | null;

  // Calendar — SAME variables as === CALENDAR TODAY === block
  calendarLoad: string | null;
  todayHighStakes: string[];
  nextHighStakesEvent: { title: string; minutesUntil: number } | null;
  hasBackToBack: boolean;

  // Patterns — SAME variables as === PATTERNS === block
  avgScore7d: number | null;
  scoreTrajectory7d: string | null;
  hrvEventCorrelation: string | null;

  // Check-in — SAME variables as === READINESS === block
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;

  // CEO behaviour — SAME flags the LLM context already receives
  behaviourFlags?: Array<{ anchorEvent?: string | null } | string> | null;

  // Tomorrow — SAME variables as === TOMORROW === block (evening only)
  tomorrowLoad: string | null;
  tomorrowHighStakesTitles: string[];
}

export interface SpecDeterministicResult {
  phrase: string;
  body: string;
  topSignal: TopSignal;
}

function genericTitle(label: string, count: number): string[] {
  return count > 0 ? Array.from({ length: count }, () => label) : [];
}

// ──────────────────────────────────────────────────────────
// PHRASE BANK — from VOICE_SOUND_LIKE
// ──────────────────────────────────────────────────────────

const PHRASE_BANK: Record<BandKey, string[]> = {
  high: ['Go get them.', 'Trust the prep.', 'Front-load it.'],
  mid:  ['Pace it today.', 'Hold the line.', 'Pick your moment.'],
  low:  ['Save your edge.', 'One thing today.', 'Protect the room.'],
};

// Signal-specific phrases (override band when signal is dominant)
const SIGNAL_PHRASES: Partial<Record<TopSignal, string>> = {
  hr_event_correlation: 'Pattern known, act early.',
  wearable_x_calendar: 'Body and calendar mismatched.',
  imminent_high_stakes: 'Prepare the next hour.',
  tomorrow_heavy: 'Set up tomorrow now.',
};

// ──────────────────────────────────────────────────────────
// READ CLAUSES — keyed on BAND (not signal)
// ──────────────────────────────────────────────────────────

const READ_CLAUSES: Record<BandKey, string> = {
  high: "Mind and body are carrying more edge than the day is asking for.",
  mid:  "Mind and composure are evenly matched with what's ahead.",
  low:  "The day is asking more than body and composure are offering — worth noticing.",
};

// ──────────────────────────────────────────────────────────
// CLOSING CLAUSES — keyed on BAND
// ──────────────────────────────────────────────────────────

const CLOSING_CLAUSES: Record<BandKey, string> = {
  high: "and don't overextend.",
  mid:  "and hold the line.",
  low:  "and protect the evening.",
};

// ──────────────────────────────────────────────────────────
// WORK DIRECTIVES — keyed on BAND × SIGNAL (30 combinations)
// ──────────────────────────────────────────────────────────

const WORK_DIRECTIVES: Record<BandKey, Record<TopSignal, string>> = {
  high: {
    hr_event_correlation: "your pattern says this event type costs — use the sharpness to lead it cleanly",
    wearable_x_calendar: "front-load the hard decisions and spend the sharpness on the highest-stakes call",
    imminent_high_stakes: "use the edge to set the agenda yourself — keep the blocks before it short",
    calendar_heavy: "front-load the hard decisions and spend the sharpness on the highest-stakes call",
    sleep_deficit: "the edge is real despite the short night — use it before it fades",
    hrv_deficit: "the sharpness is felt, not measured — run on the prep, not instinct",
    checkin_signal: "deploy the reserves on the call that matters most and bank the surplus",
    declining_trajectory: "carry the momentum into the first block and let the afternoon run lighter",
    tomorrow_heavy: "bank the surplus for tomorrow and keep the evening light",
    baseline_quiet: "carry the momentum into the first block and let the rest follow",
  },
  mid: {
    hr_event_correlation: "this event type moves your recovery — keep the block before it clean and the block after light",
    wearable_x_calendar: "pace the morning, protect one gap between the heavier calls",
    imminent_high_stakes: "keep the blocks before it short so you walk in with a clear head",
    calendar_heavy: "keep the day's rhythm and don't let back-to-backs compress your thinking time",
    sleep_deficit: "pace the morning, don't force the afternoon, and protect one gap between calls",
    hrv_deficit: "the body is working harder than it feels — keep decisions to the morning",
    checkin_signal: "park the complex calls until the fog lifts and work the structured tasks first",
    declining_trajectory: "hold pace, pick one thing to advance, and let the rest follow",
    tomorrow_heavy: "close one thing cleanly tonight and let the rest go",
    baseline_quiet: "hold the line, pick one thing to advance, and let the rest follow",
  },
  low: {
    hr_event_correlation: "past sessions of this type have cost you — shorten what's around it and walk in ready",
    wearable_x_calendar: "trim the low-value calls if you can and protect capacity for the one that counts",
    imminent_high_stakes: "save what's left for the one commitment you can't move",
    calendar_heavy: "cancel or shorten anything that isn't essential and save what's left for the one that counts",
    sleep_deficit: "the deficit is real — cut anything optional and walk into the main call as fresh as possible",
    hrv_deficit: "the system is running flat — guard the big moment, keep everything else light",
    checkin_signal: "fog plus fatigue is where errors happen — simplify to one thing and protect everything around it",
    declining_trajectory: "today starts in debt — keep the morning to one priority and don't add to the deficit",
    tomorrow_heavy: "tonight shapes tomorrow's runway — protect the evening",
    baseline_quiet: "protect the parts of the day you can control and let the rest go",
  },
};

// ──────────────────────────────────────────────────────────
// TOP SIGNAL PICKER — mirrors the LLM's PRIORITY_ORDER
// ──────────────────────────────────────────────────────────

function anchorEventFromFlag(flag: { anchorEvent?: string | null } | string | null | undefined): string | null {
  if (!flag) return null;
  if (typeof flag === 'string') return null;
  return typeof flag.anchorEvent === 'string' && flag.anchorEvent.trim().length > 0
    ? flag.anchorEvent.trim()
    : null;
}

export function pickTopSignal(p: SpecDeterministicParams): TopSignal {
  const hasCalendar = (p.todayHighStakes?.length ?? 0) > 0;

  // 1. CEO behaviour flag → if today's anchored event also has a measured
  // HRV pattern, lead with correlation; otherwise treat it as a structural
  // calendar-demand read. This keeps the deterministic path aligned with
  // the same event-aware priority order the LLM context sees.
  const topFlag = Array.isArray(p.behaviourFlags) && p.behaviourFlags.length > 0 ? p.behaviourFlags[0] : null;
  const anchorEvent = anchorEventFromFlag(topFlag);
  if (anchorEvent && p.todayHighStakes.some((title) => title === anchorEvent)) {
    if (p.hrvEventCorrelation) return 'hr_event_correlation';
    return 'calendar_heavy';
  }

  // 2. HR-event correlation (pattern + today's event)
  if (p.hrvEventCorrelation && hasCalendar) return 'hr_event_correlation';

  // 3. Wearable × calendar divergence (body down + demand up)
  const bodyDown = (p.hrvDeviation != null && p.hrvDeviation <= -10) ||
                   p.sleepHardFloor ||
                   (p.sleepDeviation != null && p.sleepDeviation <= -10);
  const demandHigh = p.calendarLoad === 'high' || (p.todayHighStakes?.length ?? 0) >= 2;
  if (p.hasWearable && bodyDown && demandHigh) return 'wearable_x_calendar';

  // 4. Imminent high-stakes (< 90 min)
  if (p.nextHighStakesEvent && p.nextHighStakesEvent.minutesUntil >= 0 && p.nextHighStakesEvent.minutesUntil < 90) {
    return 'imminent_high_stakes';
  }

  // 5. Calendar load
  if (demandHigh || p.hasBackToBack) return 'calendar_heavy';

  // 6. Sleep deficit
  if (p.sleepHardFloor || (p.sleepDeviation != null && p.sleepDeviation <= -10)) return 'sleep_deficit';

  // 7. HRV deficit
  if (p.hrvDeviation != null && p.hrvDeviation <= -8) return 'hrv_deficit';

  // 8. Check-in signal
  if ((p.clarityLevel != null && p.clarityLevel <= 2) ||
      (p.confidenceLevel != null && p.confidenceLevel <= 2) ||
      (p.checkInOutcome ? /low|struggl|foggy|scattered|drained/i.test(p.checkInOutcome) : false)) {
    return 'checkin_signal';
  }

  // 9. Declining trajectory
  if (p.scoreTrajectory7d === 'declining') return 'declining_trajectory';

  // 10. Tomorrow heavy (evening only)
  if (p.timeOfDay === 'evening' && (p.tomorrowLoad === 'high' || (p.tomorrowHighStakesTitles?.length ?? 0) > 0)) {
    return 'tomorrow_heavy';
  }

  return 'baseline_quiet';
}

function buildDivergenceLead(context: AssessmentContext): string | null {
  const divergence = context.divergence;
  if (!divergence) return null;
  const left = divergence.left.evidenceKeys;
  const right = divergence.right.evidenceKeys;
  const wearableLead =
    left.includes("hrvValue")
      ? "HRV is holding above its usual range"
      : left.includes("sleepDuration") || left.includes("sleepScore")
        ? "sleep is holding up better than the check-in suggests"
        : left.includes("rhrValue")
          ? "RHR is staying steadier than the check-in suggests"
          : null;
  const selfLead =
    right.includes("outcome")
      ? `You checked in ${context.checkIn.outcome ?? "off"}`
      : right.includes("clarityLevel")
        ? "you reported low clarity"
        : null;
  if (!wearableLead || !selfLead) return null;
  return `${selfLead}, while ${wearableLead}.`;
}

// ──────────────────────────────────────────────────────────
// EVIDENCE CLAUSE — reads SAME signal variables as LLM
// ──────────────────────────────────────────────────────────

function sleepHrsLabel(minutes: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 'short';
  const h = (minutes / 60).toFixed(1);
  return `${h}h`;
}

function buildEvidence(signal: TopSignal, p: SpecDeterministicParams): string {
  switch (signal) {
    case 'hr_event_correlation':
      return `${p.hrvEventCorrelation} — today fits that pattern.`;

    case 'wearable_x_calendar': {
      const parts: string[] = [];
      if (p.hrvDeviation != null) parts.push(`recovery ${p.hrvDeviation > 0 ? 'up' : 'down'} ${Math.abs(p.hrvDeviation)}%`);
      if (p.sleepHardFloor && p.sleepDuration != null) parts.push(`sleep ${sleepHrsLabel(p.sleepDuration)}`);
      const bodyBit = parts.join(' and ') || 'Body signals soft';
      const calBit = p.todayHighStakes[0] ? `with '${p.todayHighStakes[0]}' on the calendar` : 'with a heavy calendar';
      return `${bodyBit}, ${calBit}.`;
    }

    case 'imminent_high_stakes':
      return `'${p.nextHighStakesEvent!.title}' lands in ${p.nextHighStakesEvent!.minutesUntil} minutes.`;

    case 'calendar_heavy': {
      const bb = p.hasBackToBack ? ' with back-to-back blocks' : '';
      const st = p.todayHighStakes[0] ? ` including '${p.todayHighStakes[0]}'` : '';
      return `Calendar reads ${p.calendarLoad ?? 'heavy'}${bb}${st}.`;
    }

    case 'sleep_deficit':
      return `Sleep landed at ${sleepHrsLabel(p.sleepDuration)}${p.sleepDeviation != null ? `, ${p.sleepDeviation}% vs baseline` : ''}.`;

    case 'hrv_deficit':
      return `Recovery is ${Math.abs(p.hrvDeviation!)}% under baseline this ${p.timeOfDay}.`;

    case 'checkin_signal': {
      const parts: string[] = [];
      if (p.clarityLevel != null) parts.push(`clarity ${p.clarityLevel}/5`);
      if (p.confidenceLevel != null) parts.push(`confidence ${p.confidenceLevel}/5`);
      return `Your check-in reads ${parts.length ? parts.join(', ') : (p.checkInOutcome ?? 'soft')} this ${p.timeOfDay}.`;
    }

    case 'declining_trajectory':
      return `The mind's runway has been trending down this week${p.avgScore7d != null ? `, 7-day avg ${p.avgScore7d}` : ''}.`;

    case 'tomorrow_heavy':
      return `${p.tomorrowHighStakesTitles[0] ? `Tomorrow opens with '${p.tomorrowHighStakesTitles[0]}'` : `Tomorrow reads heavy`}.`;

    case 'baseline_quiet':
      return `Signals are quiet this ${p.timeOfDay} — nothing sharp is pulling on you.`;
  }
}

// ──────────────────────────────────────────────────────────
// TIME-OF-DAY DIRECTIVE OVERRIDE
// ──────────────────────────────────────────────────────────

function timeAwareDirective(base: string, band: BandKey, timeOfDay: string): string {
  if (timeOfDay === 'evening') {
    if (band === 'low') return 'protect the evening and close the day early';
    if (band === 'high') return 'bank the surplus for tomorrow and keep the evening light';
    return 'close one thing cleanly and let the rest go';
  }
  return base;
}

// ──────────────────────────────────────────────────────────
// ASSEMBLY
// ──────────────────────────────────────────────────────────

export function buildSpecDeterministicBrief(p: SpecDeterministicParams): SpecDeterministicResult | null {
  const band: BandKey = p.bandValence ?? 'mid';
  const topSignal = pickTopSignal(p);

  // Phrase: signal-specific override, else band-keyed from voice bank
  const signalPhrase = SIGNAL_PHRASES[topSignal];
  const phrasePool = PHRASE_BANK[band];
  const phraseIdx = Math.max(0, ['morning', 'afternoon', 'evening'].indexOf(p.timeOfDay)) % phrasePool.length;
  const phrase = signalPhrase ?? phrasePool[phraseIdx];

  // 4-beat body
  const evidence = buildEvidence(topSignal, p);
  const read = READ_CLAUSES[band];
  const rawDirective = WORK_DIRECTIVES[band][topSignal];
  const directive = timeAwareDirective(rawDirective, band, p.timeOfDay);
  const close = CLOSING_CLAUSES[band];

  const body = `${evidence} ${read} ${directive}, ${close}`;

  return { phrase, body, topSignal };
}

export function buildSpecDeterministicBriefFromAssessmentContext(
  context: AssessmentContext,
): SpecDeterministicResult | null {
  const params: SpecDeterministicParams = {
    bandValence: context.readiness.band,
    timeOfDay: context.local.window,
    hasWearable: context.wearable.hasWearable,
    hrvDeviation: context.wearable.hrvDeviation,
    sleepDuration: context.wearable.sleepDuration,
    sleepDeviation: null,
    sleepHardFloor:
      typeof context.wearable.sleepDuration === "number" &&
      context.wearable.sleepDuration < 360,
    rhrDeviation: context.wearable.rhrDeviation,
    calendarLoad: context.calendar.load,
    todayHighStakes: genericTitle("priority meeting", context.calendar.highStakesEventsCount),
    nextHighStakesEvent:
      typeof context.calendar.nextHighStakesMinutesUntil === "number"
        ? {
            title: "next priority meeting",
            minutesUntil: context.calendar.nextHighStakesMinutesUntil,
          }
        : null,
    hasBackToBack: context.calendar.hasBackToBack,
    avgScore7d: context.patterns.avgScore7d,
    scoreTrajectory7d: context.patterns.scoreTrajectory7d,
    hrvEventCorrelation: context.patterns.hrvEventCorrelation,
    checkInOutcome: context.checkIn.outcome,
    clarityLevel: context.checkIn.clarityLevel,
    confidenceLevel: context.checkIn.confidenceLevel,
    behaviourFlags: null,
    tomorrowLoad: context.calendar.tomorrowLoad,
    tomorrowHighStakesTitles: genericTitle("priority meeting", context.calendar.tomorrowHighStakesCount),
  };
  const built = buildSpecDeterministicBrief(params);
  if (!built) return null;
  const divergenceLead = buildDivergenceLead(context);
  if (!divergenceLead) return built;
  return {
    ...built,
    body: `${divergenceLead.replace(/\.$/, "")}; ${built.body}`,
  };
}

export const __specDeterministicInternals = {
  pickTopSignal,
  buildEvidence,
};
