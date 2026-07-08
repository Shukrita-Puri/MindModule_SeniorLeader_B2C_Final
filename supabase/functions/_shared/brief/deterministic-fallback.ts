// Sprint 7 / Phase 9A — Brief deterministic fallback decision helper.
//
// Pure, testable predicate that decides whether the deterministic Brief
// composer (getTheme) output may substitute for a failed/invalid LLM
// Brief on a given run. The v6.5 "no deterministic prose" contract still
// holds when the underlying signal state is awaiting; this helper only
// re-opens the deterministic path when the Brief should legitimately be
// ready but the LLM call failed.
//
// The caller owns actually plumbing `finalPhrase` / `finalContext` into
// the response + `brief_source='deterministic'` into persistence.

export interface DeterministicFallbackInput {
  /** True if a same-signature cached snapshot is already being returned. */
  cachedSnapshotPresent: boolean;
  /** True if the LLM produced an accepted brief on this run. */
  llmBriefPresent: boolean;
  /** True when the signal contract is in cold-start / no-context state. */
  awaitingSignals: boolean;
  /** True when the MRS/inner readiness state is awaiting. */
  innerStateIsAwaiting: boolean;
  /** Deterministic composer's phrase output (from getTheme). */
  deterministicPhrase: string | null | undefined;
  /** Deterministic composer's body output (from getTheme + patternOverride). */
  deterministicBody: string | null | undefined;
}

export type FallbackDecision =
  | { use: true; reason: "llm_miss_signals_ready" }
  | { use: false; reason: FallbackSkipReason };

export type FallbackSkipReason =
  | "cache_hit"
  | "llm_accepted"
  | "awaiting_signals"
  | "inner_state_awaiting"
  | "deterministic_copy_missing"
  | "deterministic_copy_invalid";

/**
 * Soft body-word ceiling for the deterministic Brief. Matches the LLM
 * Brief's 55–60 range so persisted rows stay uniform in shape.
 */
export const DETERMINISTIC_BODY_MAX_WORDS = 60;

/**
 * Hard runaway ceiling. Beyond this length the deterministic body is
 * treated as suspicious template drift and rejected rather than silently
 * truncated. Set well above the soft cap (60) so normal templates in the
 * 45–65 range are always capped-and-used, never dropped to awaiting.
 * Sprint 8: raised from 70 → 120 so valid 65–80 word templates no longer
 * fall through to awaiting when the LLM path fails.
 */
export const DETERMINISTIC_BODY_RUNAWAY_WORDS = 120;

/**
 * Decide whether the deterministic Brief may be persisted/returned this
 * run. Rules — in strict precedence order:
 *   1. cache hit → use cache, not deterministic
 *   2. LLM accepted → use LLM
 *   3. awaiting signals / inner-state awaiting → stay awaiting
 *   4. deterministic phrase/body missing or invalid → stay awaiting
 *   5. otherwise deterministic
 */
export function decideBriefFallback(inp: DeterministicFallbackInput): FallbackDecision {
  if (inp.cachedSnapshotPresent) return { use: false, reason: "cache_hit" };
  if (inp.llmBriefPresent) return { use: false, reason: "llm_accepted" };
  if (inp.awaitingSignals) return { use: false, reason: "awaiting_signals" };
  if (inp.innerStateIsAwaiting) return { use: false, reason: "inner_state_awaiting" };
  const phrase = (inp.deterministicPhrase ?? "").trim();
  const body = (inp.deterministicBody ?? "").trim();
  if (!phrase || !body) return { use: false, reason: "deterministic_copy_missing" };
  if (!isDeterministicBodyValid(body)) return { use: false, reason: "deterministic_copy_invalid" };
  return { use: true, reason: "llm_miss_signals_ready" };
}

/**
 * Cap the deterministic body to the shared word ceiling. Deterministic
 * templates in `getTheme` are already tuned to ~45–55 words; this guard
 * defends against future template drift silently persisting long copy.
 */
export function capDeterministicBody(body: string, maxWords = DETERMINISTIC_BODY_MAX_WORDS): string {
  const clean = (body || "").trim();
  if (!clean) return clean;
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  const head = words.slice(0, maxWords).join(" ").replace(/[,;:.\-—\s]+$/, "");
  return head + ".";
}

// Wellness / clinical / corporate filler tokens that must never appear in
// deterministic Brief copy. Kept intentionally narrow — the deterministic
// templates are hand-written and audited; this is a defensive guard rail,
// not a full lexicon check.
const DETERMINISTIC_BANNED = /\b(mindful|recharge|self-care|wellness|journey|synerg|leverage the|holistic|nurture|nourish|breathe|cortisol|parasympathetic|sympathetic)\b/i;

function isDeterministicBodyValid(body: string): boolean {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 3) return false;
  if (words > DETERMINISTIC_BODY_RUNAWAY_WORDS) return false; // hard reject only on runaway drift
  if (DETERMINISTIC_BANNED.test(body)) return false;
  return true;
}

/* ─────────────────────────────────────────────────────────────────────
 * Sprint C — buildDeterministicBrief
 *
 * A pure template consumer of the SAME in-scope signal variables the
 * LLM prompt already reads. It performs NO new database queries, NO new
 * signal assembly, and NO CEO-behaviour re-evaluation. Its only job is
 * to pick the top signal (mirroring the LLM triage order) and emit a
 * 4-beat body (evidence → read → directive → close) grounded in that
 * signal's number/name.
 *
 * Callers must gate invocation with `awaitingSignals === false` AND
 * `innerStateIsAwaiting === false` (same contract as decideBriefFallback).
 * The output body still passes back through `decideBriefFallback` +
 * `isDeterministicBodyValid` before it is emitted downstream.
 * ────────────────────────────────────────────────────────────────── */

export type DeterministicTopSignal =
  | 'hrv_event_correlation'
  | 'wearable_x_calendar'
  | 'imminent_high_stakes'
  | 'calendar_load'
  | 'sleep_deficit'
  | 'hrv_deficit'
  | 'check_in'
  | 'declining_trajectory'
  | 'tomorrow_heavy_evening'
  | 'baseline_state';

export interface DeterministicBriefParams {
  // Time / band
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  bandValence: 'low' | 'mid' | 'high' | null;
  safeTier: 'depleted' | 'managing' | 'strong' | 'peak' | null;
  innerReadinessScore: number | null;

  // Wearable — deviations against user's baseline (percent)
  hasWearable: boolean;
  hrvDeviation: number | null;
  sleepDuration: number | null;   // minutes
  sleepDeviation: number | null;  // percent
  sleepHardFloor: boolean;        // sleepDuration < 360
  rhrDeviation: number | null;

  // Calendar
  calendarLoad: 'low' | 'medium' | 'high' | null;
  todayHighStakes: string[];
  nextHighStakesEvent: { title: string; minutesUntil: number } | null;
  hasBackToBack: boolean;

  // Pattern / history
  avgScore7d: number | null;
  scoreTrajectory7d: 'improving' | 'stable' | 'declining' | null;
  /** Pre-formatted string from the shared signal assembly, e.g.
   *  "HRV down avg 15% before Board meetings, 4 occurrences". */
  hrvEventCorrelation: string | null;

  // Check-in
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;

  // Evening/tomorrow
  tomorrowLoad: 'low' | 'medium' | 'high' | null;
  tomorrowHighStakesTitles: string[];
}

export interface DeterministicBriefOutput {
  phrase: string;
  body: string;
  topSignal: DeterministicTopSignal;
}

/** Very small, prompt-safe parser for the pre-formatted HRV × event
 *  correlation string. Returns null if the numeric guardrails aren't met
 *  (count ≥ 3 and |delta| ≥ 10%). */
function parseHrvEventCorrelation(
  s: string | null,
): { direction: 'down' | 'up'; deltaPct: number; eventType: string; count: number } | null {
  if (!s) return null;
  // Example: "HRV down avg 15% before Board meetings, 4 occurrences"
  const m = s.match(/HRV\s+(down|up)\s+avg\s+(\d+)%\s+before\s+([^,]+?),\s*(\d+)\s+occurrence/i);
  if (!m) return null;
  const deltaPct = parseInt(m[2], 10);
  const count = parseInt(m[4], 10);
  if (!Number.isFinite(deltaPct) || !Number.isFinite(count)) return null;
  if (count < 3 || Math.abs(deltaPct) < 10) return null;
  return {
    direction: m[1].toLowerCase() === 'up' ? 'up' : 'down',
    deltaPct,
    eventType: m[3].trim().replace(/\s+meetings?$/i, ' meetings'),
    count,
  };
}

function sleepHrsLabel(minutes: number | null): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}hrs` : `${h}h ${m}m`;
}

function highStakesRef(titles: string[]): string | null {
  if (!titles || titles.length === 0) return null;
  if (titles.length === 1) return `'${titles[0]}'`;
  return `'${titles[0]}' and '${titles[1]}'`;
}

function pickTopSignal(p: DeterministicBriefParams): DeterministicTopSignal {
  const corr = parseHrvEventCorrelation(p.hrvEventCorrelation);
  if (corr) return 'hrv_event_correlation';

  const bodyDown =
    (p.hrvDeviation != null && p.hrvDeviation <= -10) ||
    p.sleepHardFloor ||
    (p.sleepDeviation != null && p.sleepDeviation <= -10);
  const demandHigh = p.calendarLoad === 'high' || (p.todayHighStakes?.length ?? 0) >= 2;
  if (p.hasWearable && bodyDown && demandHigh) return 'wearable_x_calendar';

  if (p.nextHighStakesEvent && p.nextHighStakesEvent.minutesUntil >= 0 && p.nextHighStakesEvent.minutesUntil < 90) {
    return 'imminent_high_stakes';
  }
  if (demandHigh || p.hasBackToBack) return 'calendar_load';
  if (p.sleepHardFloor || (p.sleepDeviation != null && p.sleepDeviation <= -10)) return 'sleep_deficit';
  if (p.hrvDeviation != null && p.hrvDeviation <= -8) return 'hrv_deficit';

  const clarityLow = p.clarityLevel != null && p.clarityLevel <= 2;
  const confLow = p.confidenceLevel != null && p.confidenceLevel <= 2;
  if (clarityLow || confLow || (p.checkInOutcome && /low|struggl|foggy/i.test(p.checkInOutcome))) {
    return 'check_in';
  }

  if (p.scoreTrajectory7d === 'declining') return 'declining_trajectory';

  if (p.timeOfDay === 'evening' && (p.tomorrowLoad === 'high' || (p.tomorrowHighStakesTitles?.length ?? 0) > 0)) {
    return 'tomorrow_heavy_evening';
  }

  return 'baseline_state';
}

function tierPhrase(safeTier: DeterministicBriefParams['safeTier'], topSignal: DeterministicTopSignal): string {
  if (topSignal === 'tomorrow_heavy_evening') return 'Set up tomorrow now.';
  if (topSignal === 'imminent_high_stakes') return 'Prepare the next hour.';
  if (topSignal === 'wearable_x_calendar') return 'Body strained, demand loud.';
  if (topSignal === 'hrv_event_correlation') return 'Pattern known, act early.';
  if (topSignal === 'sleep_deficit') return 'Protect the sleep floor.';
  if (topSignal === 'hrv_deficit') return 'Reserves down. Ration them.';
  if (topSignal === 'calendar_load') return 'Anchor the demand.';
  if (topSignal === 'check_in') return 'Read your own signal.';
  if (topSignal === 'declining_trajectory') return 'Reset the trajectory.';
  switch (safeTier) {
    case 'peak': return 'Channel the peak.';
    case 'strong': return 'Protect the window.';
    case 'managing': return 'Set a sustainable pace.';
    case 'depleted': return 'Begin with intention.';
    default: return 'Steady the system.';
  }
}

/** Compose the 4-beat body. Each beat is ~10–15 words; total 45–55.  */
function composeBody(p: DeterministicBriefParams, topSignal: DeterministicTopSignal): string {
  const stakes = highStakesRef(p.todayHighStakes);

  const evidence = (() => {
    switch (topSignal) {
      case 'hrv_event_correlation': {
        const c = parseHrvEventCorrelation(p.hrvEventCorrelation)!;
        return `Over ${c.count} recent ${c.eventType}, HRV runs ${c.deltaPct}% ${c.direction === 'down' ? 'below' : 'above'} baseline beforehand.`;
      }
      case 'wearable_x_calendar': {
        const hrv = p.hrvDeviation != null ? `HRV ${p.hrvDeviation}%` : null;
        const sleep = p.sleepHardFloor && p.sleepDuration != null ? `sleep ${sleepHrsLabel(p.sleepDuration)}` : null;
        const bodyBit = [hrv, sleep].filter(Boolean).join(' and ') || 'Body signals soft';
        const demandBit = stakes ? `with ${stakes} on the calendar` : 'with a heavy calendar';
        return `${bodyBit}, ${demandBit}.`;
      }
      case 'imminent_high_stakes': {
        const e = p.nextHighStakesEvent!;
        return `${e.title} lands in ${e.minutesUntil} minutes.`;
      }
      case 'calendar_load': {
        const bb = p.hasBackToBack ? ' with back-to-back blocks' : '';
        const st = stakes ? ` including ${stakes}` : '';
        return `Calendar reads ${p.calendarLoad ?? 'high'}${bb}${st}.`;
      }
      case 'sleep_deficit': {
        const dur = sleepHrsLabel(p.sleepDuration) ?? 'short';
        const dev = p.sleepDeviation != null ? `, ${p.sleepDeviation}% vs baseline` : '';
        return `Sleep landed at ${dur}${dev}.`;
      }
      case 'hrv_deficit': {
        return `HRV is ${p.hrvDeviation}% under your baseline this morning.`;
      }
      case 'check_in': {
        const parts: string[] = [];
        if (p.clarityLevel != null) parts.push(`clarity ${p.clarityLevel}/5`);
        if (p.confidenceLevel != null) parts.push(`confidence ${p.confidenceLevel}/5`);
        const label = parts.length ? parts.join(', ') : (p.checkInOutcome ?? 'check-in reads soft');
        return `Your check-in reads ${label}.`;
      }
      case 'declining_trajectory': {
        const avg = p.avgScore7d != null ? `, 7-day avg ${p.avgScore7d}` : '';
        return `Readiness has been trending down this week${avg}.`;
      }
      case 'tomorrow_heavy_evening': {
        const t = p.tomorrowHighStakesTitles[0]
          ? `'${p.tomorrowHighStakesTitles[0]}' anchors tomorrow`
          : `Tomorrow reads ${p.tomorrowLoad ?? 'heavy'}`;
        return `${t}.`;
      }
      default: {
        const s = p.innerReadinessScore;
        if (typeof s === 'number') return `Readiness sits at ${s}, no single signal dominating.`;
        return 'Signals are quiet; nothing sharp is pulling on you.';
      }
    }
  })();

  const read = (() => {
    switch (topSignal) {
      case 'hrv_event_correlation': return 'That pattern shows up before it shows in the room.';
      case 'wearable_x_calendar':   return 'Supply is thin, demand is loud — friction lands here.';
      case 'imminent_high_stakes':  return 'This is the first place your state gets tested today.';
      case 'calendar_load':         return 'Density this high compresses your recovery windows.';
      case 'sleep_deficit':         return 'Short nights drag decision quality more than mood.';
      case 'hrv_deficit':           return 'Your system is asking for smaller bets, not bigger ones.';
      case 'check_in':              return 'Felt-state is your earliest tell — do not push past it.';
      case 'declining_trajectory':  return 'The line is drifting; one deliberate day resets it.';
      case 'tomorrow_heavy_evening':return 'What you decide tonight becomes tomorrow\'s runway.';
      default:                       return 'A neutral day is when compounding still moves.';
    }
  })();

  const directive = (() => {
    switch (topSignal) {
      case 'hrv_event_correlation': return 'Pre-load a 5-minute reset before that event type.';
      case 'wearable_x_calendar':   return 'Cut one meeting or defer one decision before noon.';
      case 'imminent_high_stakes':  return 'Reserve the next 10 minutes for the opening move.';
      case 'calendar_load':         return 'Guard one 20-minute block for the highest-leverage call.';
      case 'sleep_deficit':         return 'Move the hardest decision earlier; hold routine work for later.';
      case 'hrv_deficit':           return 'Downshift one commitment and keep the anchor moves.';
      case 'check_in':              return 'Pick one thing to finish cleanly; drop one thing today.';
      case 'declining_trajectory':  return 'Do one hard thing early; log the win before lunch.';
      case 'tomorrow_heavy_evening':return 'Set the first move for tomorrow and stop after that.';
      default:                       return 'Anchor the first hour; the rest follows the anchor.';
    }
  })();

  const close = 'Small, deliberate, done.';

  return `${evidence} ${read} ${directive} ${close}`;
}

export function buildDeterministicBrief(
  p: DeterministicBriefParams,
): DeterministicBriefOutput | null {
  const topSignal = pickTopSignal(p);
  const body = composeBody(p, topSignal);
  const capped = capDeterministicBody(body, DETERMINISTIC_BODY_MAX_WORDS);
  if (!isDeterministicBodyValid(capped)) return null;
  return {
    phrase: tierPhrase(p.safeTier, topSignal),
    body: capped,
    topSignal,
  };
}