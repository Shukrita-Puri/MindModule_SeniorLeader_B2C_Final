/**
 * _shared/personas/ceo/behaviour-copy.ts
 *
 * CEO persona — deterministic copy pack for every brief-scoped behaviour rule.
 *
 * FOUR-BEAT CONTRACT (canonical source: BODY_FOUR_BEAT_CONTRACT in copy-vocabulary.ts)
 * ──────────────────
 * (a) evidence   — 2 signals from different buckets (calendar + wearable, or calendar + self-decl)
 * (b) read       — the one sharp judgment those signals add up to
 * (c) directive  — the WORK DIRECTIVE: cognitive posture for today's real demand (never a practice)
 * (d) close      — SELF-REGULATION DIRECTIVE: 3–8 word closing clause
 *
 * WIRING
 * ──────
 * Each of the four existing builders in deterministic-brief.ts consults this pack
 * for the leading flag before falling through to generic logic:
 *   buildEvidence(flag, ctx)  → entry.evidence(ctx)
 *   buildRead(flag, ctx)      → entry.read(ctx)
 *   buildDirective(flag, ctx) → entry.directive(ctx)
 *   closeFor(flag, ctx)       → entry.close(ctx)
 *
 * Rules with no entry fall through to today's generic copy — no regression risk.
 * Weekend/non-workday rule: beats (c) and (d) must contain zero work language.
 * Beats (b) and (c) must not say the same thing — enforced by existing test.
 *
 * CONTRACT TEST
 * ─────────────
 * Every brief-scoped rule in ALL_RULES must have an entry here.
 * See: ceo-behaviour-rules.test.ts → 'contract: all brief-scoped rules have deterministic copy'
 *
 * PERSONA SEAM
 * ────────────
 * Copy lives here; thresholds live in _shared/personas/ceo/thresholds.ts.
 * To add a middle-management or student persona: two new files, do not edit this one.
 */

import type { BriefCopyContext } from "../../brief-context.ts";
import { timeUntilPhrase, withTiming } from "../../brief/time-phrase.ts";
import type { BriefNarrativeFamily, LeadNarrative } from "../../brief/lead-narrative.ts";
import {
  detectCluster,
  lexiconFallbackClause,
} from "../../copy-vocabulary.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Type — mirrors the four builders in deterministic-brief.ts
// ─────────────────────────────────────────────────────────────────────────────

export type BehaviourCopyEntry = {
  /** Beat (a): EVIDENCE — 2 signals from different buckets */
  evidence: (ctx: BriefCopyContext) => string;
  /** Beat (b): THE READ — one sharp judgment */
  read: (ctx: BriefCopyContext) => string;
  /** Beat (c): WORK DIRECTIVE — cognitive posture, never a practice name */
  directive: (ctx: BriefCopyContext) => string;
  /** Beat (d): SELF-REGULATION DIRECTIVE — 3–8 words */
  close: (ctx: BriefCopyContext) => string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const anchor = (ctx: BriefCopyContext): string =>
  ctx.anchorEvent?.title ?? 'your highest-stakes event today';

/**
 * Anchor reference carrying its time-to-event clause when the calendar knows it
 * ("the board call in 45 minutes"). Never invent timing — falls back to the
 * bare title. Single source: _shared/brief/time-phrase.ts.
 */
const anchorTimed = (ctx: BriefCopyContext): string =>
  withTiming(anchor(ctx), ctx.anchorEvent?.minutesUntil);

/** Standalone timing clause, or null when the calendar has no usable timing. */
const anchorWhen = (ctx: BriefCopyContext): string | null =>
  timeUntilPhrase(ctx.anchorEvent?.minutesUntil);

const categorySequence = (ctx: BriefCopyContext): string =>
  ctx.evidence?.categorySequence ?? 'product → finance → people';

const attendeeCount = (ctx: BriefCopyContext): number =>
  ctx.evidence?.attendeeCount ?? 6;

const decisionCount = (ctx: BriefCopyContext): number =>
  ctx.evidence?.decisionCount ?? 3;

const tzShift = (ctx: BriefCopyContext): number =>
  ctx.evidence?.timezoneShiftHours ?? 3;

const confDay = (ctx: BriefCopyContext): number =>
  ctx.evidence?.conferenceDayNumber ?? 2;

const btbHours = (ctx: BriefCopyContext): number =>
  ctx.evidence?.backToBackHours ?? 4;

// ─────────────────────────────────────────────────────────────────────────────
// Copy Pack
// ─────────────────────────────────────────────────────────────────────────────

export const BEHAVIOUR_COPY: Record<string, BehaviourCopyEntry> = {

  // ───────────────────────────────────────────────────────────────────────────
  // §2.11  VETO RISK
  // Signal: high self-declared state + depleted wearable → masked fatigue
  // ───────────────────────────────────────────────────────────────────────────
  vetoRisk: {
    evidence: (ctx) =>
      `Self-declared state is high; wearable reads depleted.`,
    read: (ctx) =>
      `Masked fatigue — you're presenting ready but the body signal says otherwise.`,
    directive: (ctx) =>
      `Before ${anchorTimed(ctx)}, run a 60-second honest internal audit: ` +
      `what are you not saying about how you actually feel?`,
    close: () => `don't lead with the mask`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.12  SECOND WIND
  // Signal: midday recovery after compressed morning
  // ───────────────────────────────────────────────────────────────────────────
  secondWind: {
    evidence: (ctx) =>
      `Compressed morning block has cleared; a recovery window is now open.`,
    read: (ctx) =>
      `Real lift available — post-effort clarity, not fresh energy.`,
    directive: (ctx) =>
      `Deploy it on the one decision or conversation the morning's noise crowded out — ` +
      `don't spend it on catch-up.`,
    close: () => `use the lift, don't waste it`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.13  CIRCADIAN PRIORITY
  // Signal: ≥3h timezone shift or travel day
  // ───────────────────────────────────────────────────────────────────────────
  circadianPriority: {
    evidence: (ctx) =>
      `${tzShift(ctx)}-hour timezone delta active; body clock and calendar are not aligned.`,
    read: (ctx) =>
      `Circadian re-entry day — your cognitive runway is running below what the calendar assumes.`,
    directive: (ctx) =>
      `Push your first high-stakes commitment 90 minutes later than instinct suggests; ` +
      `treat hydration as a cognitive input today.`,
    close: () => `clock before calendar today`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.14  DECISION LEAKAGE GUARD
  // Signal: elevated emotional proxy OR self-declared depleted + emotional calendar event
  // ───────────────────────────────────────────────────────────────────────────
  decisionLeakageGuard: {
    evidence: (ctx) =>
      `Elevated emotional proxy with ${anchorTimed(ctx)} on the calendar.`,
    read: (ctx) =>
      `Decision leakage risk — emotional state is likely to drive the call, not inform it.`,
    directive: (ctx) =>
      `Name the specific worry and the single outcome you're protecting ` +
      `before you walk into that room.`,
    close: () => `ground the frame first`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.15  POST-PEAK HANGOVER
  // Signal: high yesterday + recovery deficit today
  // ───────────────────────────────────────────────────────────────────────────
  postPeakHangover: {
    evidence: (ctx) =>
      `High-output day yesterday; wearable shows recovery deficit carrying into today.`,
    read: (ctx) =>
      `Performance residue — physiological drag, not a mindset problem.`,
    directive: (ctx) =>
      `Treat recovery as the first deliverable before ${anchorTimed(ctx)}; ` +
      `inbox clearance is the wrong priority right now.`,
    close: () => `recover before the next peak`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.16  PERSONAL FRICTION INFERENCE
  // Signal: pattern of Sunday/Monday self-decl decline without wearable cause
  // ───────────────────────────────────────────────────────────────────────────
  personalFrictionInference: {
    evidence: (ctx) =>
      `Recurring self-declared dip at this point in the week; no wearable cause detected.`,
    read: (ctx) =>
      `Internal Buffer compression — pattern-based, not physiological.`,
    directive: (ctx) =>
      `Name the one thing creating the most anticipatory friction and schedule it first ` +
      `or move it out entirely.`,
    close: () => `don't carry it into the room`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.17  BOARD-LEVEL OUTCOME
  // Signal: any stakes_level board/external/investor within 24h
  // ───────────────────────────────────────────────────────────────────────────
  boardLevelOutcome: {
    evidence: (ctx) => {
      const when = anchorWhen(ctx);
      return when
        ? `${anchor(ctx)} lands ${when}; every choice between now and then is a preparation input.`
        : `${anchor(ctx)} is the day's governing commitment; every choice before it is a preparation input.`;
    },
    read: (ctx) =>
      `Board-level rooms read leaders as signals before they read them as speakers.`,
    directive: (ctx) =>
      `Frame every decision today through one question: does this build or erode ` +
      `the executive presence that room requires?`,
    close: () => `steady yourself well ahead of it`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §5.2  CONTEXT SWITCHING COST
  // Signal: 3+ distinct category shifts in a 4-hour window
  // ───────────────────────────────────────────────────────────────────────────
  contextSwitchingCost: {
    evidence: (ctx) =>
      `Next 4 hours run ${categorySequence(ctx)} — ` +
      `3 distinct cognitive modes in a single block.`,
    read: (ctx) =>
      `Context-tax day — cognitive residue from each switch degrades the next room.`,
    directive: (ctx) =>
      `Write one exit sentence after each meeting capturing what was decided and what's open; ` +
      `don't carry the previous frame into the next room.`,
    close: () => `reset yourself in the gaps`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §5.2 / §7  INTERPERSONAL MEETING CONTEXT
  // Signal: categoryId === 'D' or isInterpersonal, especially before high-stakes
  // ───────────────────────────────────────────────────────────────────────────
  interpersonalMeetingContext: {
    evidence: (ctx) =>
      `${anchorTimed(ctx)} is a high-drain interpersonal conversation ` +
      `with a high-stakes event following it.`,
    read: (ctx) =>
      `Emotional activation state from this meeting will leak into the next room.`,
    directive: (ctx) =>
      `Build a hard 15-minute buffer after this before any decision or performance moment — ` +
      `use it to discharge, not debrief.`,
    close: () => `settle before you walk in`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // DECISION DENSITY
  // Signal: high decision count and/or attendee weight in upcoming blocks
  // ───────────────────────────────────────────────────────────────────────────
  decisionDensity: {
    evidence: (ctx) =>
      `${decisionCount(ctx)} decision moments today; rooms of ${attendeeCount(ctx)}+ people.`,
    read: (ctx) =>
      `Decision fatigue is dose-dependent — sequencing now determines quality later.`,
    directive: (ctx) =>
      `Run reversible decisions first; protect irreversible ones for your peak window, ` +
      `not the end of a compressed block.`,
    close: () => `steady yourself between the calls`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // BACK-TO-BACK LOAD OVERRIDE
  // Signal: 4+ hours of meetings with <15 min gaps
  // ───────────────────────────────────────────────────────────────────────────
  backToBackLoadOverride: {
    evidence: (ctx) =>
      `${btbHours(ctx)}h of back-to-back commitments with no real gaps today.`,
    read: (ctx) =>
      `Cognitive bandwidth is not keeping pace with the calendar — pattern-matching ` +
      `replaces judgment by hour four.`,
    directive: (ctx) =>
      `No new decisions between blocks; one deliberate breathing anchor ` +
      `between the two heaviest meetings.`,
    close: () => `use the gaps to settle`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // STACKED STAKES
  // Signal: multiple high-stakes events same day
  // ───────────────────────────────────────────────────────────────────────────
  stackedStakes: {
    evidence: (ctx) =>
      `Two distinct high-stakes demands on today's calendar; ${anchor(ctx)} is not the only one.`,
    read: (ctx) =>
      `Stacked stakes compound — performance residue from the first contaminates the second.`,
    directive: (ctx) =>
      `Run the pre-protocol for each separately; don't let one event borrow ` +
      `the other's preparation window.`,
    close: () => `reset yourself between each one`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CONFERENCE DEPLETION
  // Signal: multi-day conference; cumulative depletion by day N
  // ───────────────────────────────────────────────────────────────────────────
  conferenceDepletion: {
    evidence: (ctx) =>
      `Day ${confDay(ctx)} of a multi-day event; cumulative social performance load compounding.`,
    read: (ctx) =>
      `Conference fatigue hits the interpersonal read first; ` +
      `that is the most expensive Executive Presence to lose at an external event.`,
    directive: (ctx) =>
      `Pace the afternoon block at half attention and skip the corridor rounds; ` +
      `the debrief keeps until tomorrow.`,
    close: () => `and pace the social battery`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CONFERENCE DAY LOAD
  // Signal: single conference or public event day
  // ───────────────────────────────────────────────────────────────────────────
  conferenceDayAttend: {
    evidence: (ctx) =>
      `Full public-performance day; every corridor interaction is a stakeholder moment.`,
    read: (ctx) =>
      `Informal interactions carry disproportionate weight because they're read as unguarded truth.`,
    directive: (ctx) =>
      `Keep your output to the two rooms that actually matter and skip the rest of the agenda; ` +
      `presence is the only thing being read today.`,
    close: () => `and hold your visible state`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // VISIBILITY / COMMUNICATIONS WINDOW
  // Signal: keynote, media, town hall, all-hands
  // ───────────────────────────────────────────────────────────────────────────
  visibilityCommsPrep: {
    evidence: (ctx) =>
      `${anchorTimed(ctx)} is an exposed moment; words and presence read beyond the room.`,
    read: (ctx) =>
      `Town halls are culture delivery, not information delivery — ` +
      `emotional register is what people feel, repeat, and act on.`,
    directive: (ctx) =>
      `Identify the one idea every person should leave with; ` +
      `activate storytelling mode, not reporting mode.`,
    close: () => `and set the tone deliberately`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // INFLUENCE & PERSUASION WINDOW
  // Signal: pitch, negotiation, high-stakes presentation
  // ───────────────────────────────────────────────────────────────────────────
  influencePersuasionPrep: {
    evidence: (ctx) =>
      `${anchorTimed(ctx)} is a persuasion-mode event — the goal is position shift, not information transfer.`,
    read: (ctx) =>
      `Thin confidence reads as thin conviction; visible anxiety reads as shaky credibility.`,
    directive: (ctx) =>
      `Anchor your confidence state and frame the ask clearly in your own mind ` +
      `before you walk in — sharp activation is useful here.`,
    close: () => `conviction before the room`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // NEGOTIATION DENSITY
  // Signal: multiple negotiation or influence moments stacked
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // DEEP WORK BLOCK
  // Signal: protected solo thinking / strategy block
  // ───────────────────────────────────────────────────────────────────────────
  deepWorkProtection: {
    evidence: (ctx) =>
      `Protected deep-work window in today's calendar — rare and already at risk.`,
    read: (ctx) =>
      `Shallow thinking in deep-work time is the most expensive calendar error you can make.`,
    directive: (ctx) =>
      `Defend the window before it starts: one concrete thinking objective, ` +
      `notifications closed, no catch-up tasks inside it.`,
    close: () => `protect the thinking window`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // MORNING BASELINE WINDOW
  // Signal: morning check-in anchor
  // ───────────────────────────────────────────────────────────────────────────
  morningBaseline: {
    evidence: (ctx) =>
      `Morning anchor window — the daily habit that calibrates everything that follows.`,
    read: (ctx) =>
      `Leaders who start from a defined priority carry it through pressure; ` +
      `those who start from the inbox react to everyone else's.`,
    directive: (ctx) =>
      `Name the single outcome that makes today a success regardless of what else happens — ` +
      `let that orient the day, not the inbox.`,
    close: () => `name the one thing first`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // UPWARD REPORTING WINDOW
  // Signal: board prep, investor update approaching
  // ───────────────────────────────────────────────────────────────────────────
  upwardReporting: {
    evidence: (ctx) =>
      `${anchorTimed(ctx)} — a room where you report up, not down.`,
    read: (ctx) =>
      `Under-prepared in that room is a trust event, not just a performance miss.`,
    directive: (ctx) =>
      `One thing must move off the plate now to create real prep space — ` +
      `identify it and reschedule it.`,
    close: () => `clear the plate for prep`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // BOARD READINESS WINDOW
  // Signal: 48h advance prep window for board-level event
  // ───────────────────────────────────────────────────────────────────────────
  advancePrep24h: {
    evidence: (ctx) =>
      `48-hour prep window for ${anchor(ctx)} — this window determines how the room goes.`,
    read: (ctx) =>
      `Board rooms are high-inference environments; every pause and framing choice ` +
      `is read for organisational competence.`,
    directive: (ctx) =>
      `Identify the two or three questions most likely to challenge you and ` +
      `prepare how you'll hold composure while answering them.`,
    close: () => `and shape the room beforehand`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // POST-GOVERNANCE OFFLOAD
  // Signal: high-stakes governance event just concluded
  // ───────────────────────────────────────────────────────────────────────────
  postGovernanceOffload: {
    evidence: (ctx) =>
      `${anchor(ctx)} just concluded; post-governance cortisol crash window is active.`,
    read: (ctx) =>
      `Decisions made in the 90 minutes post-governance over-rely on the frame ` +
      `of the meeting just finished.`,
    directive: (ctx) =>
      `Protect the next 90 minutes from non-critical decisions — ` +
      `defer, delegate, or push to tomorrow anything that isn't time-critical.`,
    close: () => `protect the post-board window`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EMOTIONAL DRAIN CUMULATIVE
  // Signal: multiple emotionally demanding events stacking
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // MEETING DENSITY HIGH
  // Signal: meeting count above sustainable threshold
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // SUNDAY RESET
  // Signal: Sunday 18:00–21:00 week-ahead window
  // ───────────────────────────────────────────────────────────────────────────
  sundayReset: {
    evidence: (ctx) =>
      `Sunday reset window — the most leveraged 30 minutes of the week.`,
    read: (ctx) =>
      `Leaders who define week intent on Sunday are protected from the reactive spiral ` +
      `that starts in the first hour of Monday.`,
    directive: (ctx) =>
      `Set the week's single priority — the one outcome that makes Monday through Friday ` +
      `a success regardless of what else happens.`,
    close: () => `set the week's one thing`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // SUNDAY EVENING WEEK-AHEAD
  // Signal: Sunday PM with heavy Monday in view
  // ───────────────────────────────────────────────────────────────────────────
  sundayEveningWeekAhead: {
    evidence: (ctx) =>
      `Heavy Monday is in view; Sunday PM brief is better than Monday AM panic.`,
    read: (ctx) =>
      `Anticipatory anxiety about a heavy Monday degrades the sleep that would protect it.`,
    directive: (ctx) =>
      `Name the two outcomes that matter most tomorrow and the one meeting that will be hardest — ` +
      `let tonight's recovery serve those.`,
    close: () => `brief tomorrow from tonight`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // WEEKEND LADDER
  // Signal: active calendar on a weekend
  // ───────────────────────────────────────────────────────────────────────────
  weekendWithMeeting: {
    evidence: (ctx) =>
      `Weekend day with an active calendar — a different cognitive contract than a workday.`,
    read: (ctx) =>
      `Weekend work that doesn't involve thinking you couldn't do in the week ` +
      `is a recovery deficit disguised as productivity.`,
    directive: (ctx) =>
      `Use this time for strategic synthesis and framing — not tactical clearance.`,
    close: () => `synthesis over clearance`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // PTO APPROACH
  // Signal: PTO or public holiday
  // ───────────────────────────────────────────────────────────────────────────
  holidayReducedTouch: {
    evidence: (ctx) =>
      `Rest or public holiday day — morning anchor stays, everything else earns its way in.`,
    read: (ctx) =>
      `Leaders who genuinely disconnect on rest days return with measurably better strategic clarity.`,
    directive: (ctx) =>
      `Treat restoration as the primary objective; one async task maximum if you engage with work.`,
    close: () => `and protect the rest window`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // NOTIFICATION IS THE PRODUCT
  // Signal: ≥4h back-to-back + low app-open rate (nudge-scoped; included for fallback safety)
  // ───────────────────────────────────────────────────────────────────────────
  notificationIsProduct: {
    evidence: (ctx) =>
      `Calendar fully compressed; no space for a full check-in protocol today.`,
    read: (ctx) =>
      `A light touch that happens beats a full protocol that doesn't — ` +
      `friction is the enemy of the habit.`,
    directive: (ctx) =>
      `One 90-second breathing anchor before the heaviest meeting; that's the entire brief today.`,
    close: () => `one anchor, nothing more`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // PRE-EVENT SLEEP TARGET (stub — evening nudge)
  // ───────────────────────────────────────────────────────────────────────────
  preEventSleepTarget: {
    evidence: (ctx) =>
      `${anchor(ctx)} is tomorrow morning; tonight's sleep is a preparation input.`,
    read: (ctx) =>
      `Sleep-deprived performance degrades working memory, inhibitory control, ` +
      `and emotional regulation — exactly what that room requires.`,
    directive: (ctx) =>
      `Target 7.5 hours; set a device-off time now that makes it possible.`,
    close: () => `bank the sleep tonight`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CRISIS INJECTION (stub — user-initiated manual flag)
  // ───────────────────────────────────────────────────────────────────────────
  crisisInjection: {
    evidence: (ctx) =>
      `Unplanned high-stakes event injected into today — system re-prioritising around it.`,
    read: (ctx) =>
      `Reactive urgency narrows attention and shortcuts the deliberation complex situations require.`,
    directive: (ctx) =>
      `90 seconds to ground and identify the single most important outcome ` +
      `before doing anything else for ${anchor(ctx)}.`,
    close: () => `ground before you react`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // MULTI-CALENDAR LOAD DISTORTION (stub)
  // ───────────────────────────────────────────────────────────────────────────
  multiCalendarLoad: {
    evidence: (ctx) =>
      `Load signal reading higher than the primary calendar shows — multiple sources contributing.`,
    read: (ctx) =>
      `The fatigue arrives from the aggregate regardless of how events are distributed across calendars.`,
    directive: (ctx) =>
      `Triage against the total load, not the primary calendar view.`,
    close: () => `and triage the total load`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // POST-TRIP RE-ENTRY RISK (stub)
  // ───────────────────────────────────────────────────────────────────────────
  postTripReentry: {
    evidence: (ctx) =>
      `Recent travel return with today's calendar loading before re-entry arc is complete.`,
    read: (ctx) =>
      `The body has landed but the nervous system is still in transit mode — ` +
      `decision quality and emotional read are running below what adrenaline suggests.`,
    directive: (ctx) =>
      `Treat today as a calibration day: one priority only, ` +
      `defer anything that can wait 24 hours.`,
    close: () => `re-entry before full load`,
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Contract helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns brief-scoped rule names missing from BEHAVIOUR_COPY.
 * Used in the CI contract test — new rules cannot ship brief-scoped without an entry.
 *
 * it('contract: all brief-scoped rules have deterministic copy', () => {
 *   expect(missingCopyEntries(ALL_RULES)).toEqual([]);
 * });
 */
/**
 * Rules whose deterministic copy is owned by the day-shape branches in
 * `brief/deterministic-brief.ts` (travel, conference, weekend, PTO, evening
 * shutdown). Those branches run BEFORE the copy-pack lookup and their copy is
 * intentionally not duplicated here. Exempt from the CI contract.
 */
export const DAY_SHAPE_OWNED_RULES: readonly string[] = [
  'conferenceNightBeforeSummit',
  'conferenceDayWithSpeaking',
  'dropInSpeakingHighStakes',
  'conferenceCarryFatigue',
  'postConferenceReentry',
  'fullWorkingWeekend',
  'weekendDeepWorkBlock',
  'weekendMorningLightTouch',
  'ptoWithMeetingFallback',
  'travelPreFlightMandatory',
  'travelLandingOffload',
  'travelLandingPlusHighStakes',
  'longHaulRecovery',
  'travelDayArrivalFraming',
  'travelDayReturnRecovery',
  'eveningShutdown',
];

export function missingCopyEntries(
  allRules: Array<{ rule: string; scopes: string[] }>
): string[] {
  return allRules
    .filter((r) => r.scopes.includes('brief'))
    .map((r) => r.rule)
    .filter((rule) => !DAY_SHAPE_OWNED_RULES.includes(rule))
    .filter((rule) => !(rule in BEHAVIOUR_COPY));
}

// ═════════════════════════════════════════════════════════════════════════════
// NARRATIVE COPY — the scenario families resolved by _shared/brief/lead-narrative.ts
// ═════════════════════════════════════════════════════════════════════════════
//
// Same four-beat contract as BEHAVIOUR_COPY above; different key. BEHAVIOUR_COPY
// is keyed by behaviour RULE, NARRATIVE_COPY by narrative FAMILY (today's story).
// Rendered by _shared/brief/deterministic-brief.ts when a non-baseline narrative
// owns the body.
//
// WINDOW RULE (matches _shared/signal-engine/{morning,afternoon,evening}-context.ts)
//   morning    body bucket = overnight recovery / sleep. Day bucket = the day ahead.
//   afternoon  sleep + overnight recovery are NOT quotable. Day bucket = what has
//              already run and what is left.
//   evening    sleep is NOT quotable, "the day ahead" is NOT quotable. Day bucket
//              = what today cost. Directive closes the day; close is recovery only.
//
// Register: CHIEF_OF_STAFF_PERSONA. Plain executive English. No wellness words,
// no clinical terms (HRV, cortisol, baseline), no score or tier leakage, never
// the literal A–H letters.

export type NarrativeBand =
  | "firing"
  | "sharp"
  | "steady"
  | "stretched"
  | "depleted";

export type NarrativeWindow = "morning" | "afternoon" | "evening";

export interface NarrativeCopyInput {
  narrative: LeadNarrative;
  band: NarrativeBand;
  /** Already sanitised recovery sentence, e.g. "Recovery is below its usual range". */
  wearableFact: string | null;
  sleepScore: number | null;
  checkInOutcome: "sharp" | "holding" | "drained" | null;
  /**
   * True only when a check-in exists for today's local date and this window.
   * When false, no felt-state claim may be emitted, regardless of
   * `checkInOutcome`. Defaults to `checkInOutcome != null` for back-compat.
   */
  hasCheckIn?: boolean;
  window: NarrativeWindow;
  /** Anchor reference carrying its timing clause, e.g. "the investor call in 45 minutes". */
  anchorRef: string | null;
  /** Anchor reference without timing, e.g. "the investor call". */
  anchorRefPlain: string | null;
  /** Stable within a day, varied across days: `${userId}|${localDate}|${window}`. */
  variantSeed: string;
}

export interface NarrativeBeats {
  evidence: string;
  read: string;
  directive: string;
  close: string;
}

const LOW = (b: NarrativeBand) => b === "stretched" || b === "depleted";

function nHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function nPick<T>(variants: T[], seed: string, salt: string): T {
  return variants[nHash(`${seed}|${salt}`) % variants.length];
}

function nCap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lower-cases the first word unless it is a proper noun-ish acronym. */
function nLower(s: string): string {
  const first = s.split(" ")[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Polish fix 1 — the anchor's time clause is spent at most ONCE per body.
 * First beat to reference the anchor gets the timed form; every later beat
 * gets the plain title.
 */
function makeAnchorRef(i: NarrativeCopyInput): () => string | null {
  let spent = false;
  return () => {
    // Evening speaks about a day that has run — a countdown clause is never
    // correct there, so the plain reference is the only form.
    if (i.window === "evening") return i.anchorRefPlain ?? i.anchorRef ?? null;
    if (!spent && i.anchorRef) {
      spent = true;
      return i.anchorRef;
    }
    return i.anchorRefPlain ?? i.anchorRef ?? null;
  };
}

// ── Beat (a) — evidence ─────────────────────────────────────────────────────

/**
 * Body bucket, window-gated. Sleep and overnight recovery only speak in the
 * morning — after that the leader is already out on whatever they had, and
 * quoting last night is stale. Returns null rather than inventing a signal.
 */
function nBodySignal(i: NarrativeCopyInput): string | null {
  if (i.window !== "morning") return null;
  if (i.wearableFact) return i.wearableFact;
  if (typeof i.sleepScore === "number") {
    if (i.sleepScore < 65) return "Sleep ran short last night";
    if (i.sleepScore >= 80) return "Sleep was solid last night";
    return "Sleep was about normal";
  }
  return null;
}

function nFeltSignal(i: NarrativeCopyInput): string | null {
  // Freshness gate: felt-state phrasing is only allowed when a check-in exists
  // for today's local date and this window.
  const hasCheckIn = i.hasCheckIn ?? (i.checkInOutcome != null);
  if (!hasCheckIn || !i.checkInOutcome) return null;
  const word = i.checkInOutcome;
  if (i.window === "evening") return `you came out of the day ${word}`;
  if (i.window === "afternoon") return `you checked in ${word} at the turn`;
  return `you checked in ${word}`;
}

/** Day bucket, tense-correct for the window. */
function nShapeSignal(i: NarrativeCopyInput, ref: () => string | null): string {
  const a = i.narrative.aggregates;
  const w = i.window;
  const past = w === "evening";
  const mid = w === "afternoon";
  const anchor = ref();

  switch (i.narrative.family) {
    case "travel_long_haul":
      if (past) return `a long flight behind you`;
      if (mid) {
        return a.meetingsAfterTravel > 0
          ? `the long leg still to fly and work waiting on the other side`
          : `the long leg still to fly`;
      }
      return a.meetingsAfterTravel > 0
        ? `a long flight today and work waiting on the other side`
        : `a long flight today`;
    case "travel_short_haul":
      if (past) return `work either side of the flight, now done`;
      if (mid) return `the flight and what is booked after it still to come`;
      return a.meetingsBeforeTravel > 0 && a.meetingsAfterTravel > 0
        ? `work either side of the flight`
        : `a flight and work around it`;
    case "travel_intercity":
      if (past) return `out and back inside one day`;
      if (mid) return `the return leg still ahead of you`;
      return `out and back in one day`;
    case "persuasion_pre":
      return anchor
        ? (past ? `${anchor} behind you` : `${anchor} on the calendar`)
        : (past ? `the pitch behind you` : `a pitch on the calendar`);
    // Polish fix 2 — no more "{event} ahead".
    case "visibility_pre":
      if (past) return anchor ? `${anchor} already held` : `the room already held`;
      return anchor ? `${anchor} is the room today` : `a room to hold today`;
    case "visibility_post":
      return past
        ? `you came off the stage earlier`
        : `you have just come off the stage`;
    case "conference_arc":
      return a.conferenceDayNumber && a.conferenceDayNumber > 1
        ? (past ? `day ${a.conferenceDayNumber} of the event done` : `day ${a.conferenceDayNumber} of the event`)
        : (past ? `the first full day of the event done` : `the first full day of the event`);
    case "back_to_back":
      if (a.backToBackHours >= 3) {
        if (past) return `${a.backToBackHours} hours of the day ran without a gap`;
        if (mid) return `what is left of the day runs without a gap`;
        return `${a.backToBackHours} hours of the day run without a gap`;
      }
      return past
        ? `${a.meetingCount} meetings ran with almost nothing between them`
        : `${a.meetingCount} meetings with almost nothing between them`;
    case "weight_heavy":
      return past
        ? `${a.highStakesCount} rooms today that actually decided something`
        : mid
        ? `${a.highStakesCount} rooms today that decide something, some still to come`
        : `${a.highStakesCount} rooms today that actually decide something`;
    case "volume_heavy":
      return past
        ? `${a.meetingCount} meetings, most of which decided nothing`
        : `${a.meetingCount} meetings, most of which decide nothing`;
    case "context_switching":
      return past
        ? `${a.distinctCategories} different kinds of room in one day`
        : mid
        ? `${a.distinctCategories} different kinds of room, and more of them left`
        : `${a.distinctCategories} different kinds of room in one day`;
    default:
      return past ? `${a.meetingCount} meetings behind you` : `${a.meetingCount} meetings today`;
  }
}

/**
 * Polish fix 3 — seeded connectors and orderings so consecutive days do not
 * open the same way. Seed is stable within a day.
 */
/**
 * Collapses any internal sentence break so a beat can never spend more than
 * one sentence of the 1–3 sentence body budget.
 */
function nOneSentence(s: string): string {
  return s
    .trim()
    .replace(/\.\s+/g, "; ")
    .replace(/[.;,\s]+$/, "")
    .trim();
}

/**
 * `validateV61Output` rejects the whole body on any em/en dash between words
 * (`DASH_BREAK`), so every beat converts its dashes to semicolons before it is
 * assembled. Numeric ranges (0–2) are left alone.
 */
function nNoDash(s: string): string {
  return s
    .replace(/\s+[—–]\s+/g, "; ")
    .replace(/([A-Za-z,])\s*[—–]\s*([A-Za-z])/g, "$1; $2");
}

/** Lowercase the first word after a collapse point unless it is an acronym. */
function nLowerAfterBreak(s: string): string {
  return s.replace(/;\s+([A-Z][a-z])/g, (_m, w: string) => `; ${w.toLowerCase()}`);
}

/**
 * One beat, one sentence, no dashes. Returns the clause WITHOUT terminal
 * punctuation so callers can end it with "." or hand it to the close.
 */
function nClause(s: string): string {
  return nLowerAfterBreak(nOneSentence(nNoDash(s)));
}

function nBuildEvidence(i: NarrativeCopyInput, ref: () => string | null): string {
  const body = nBodySignal(i);
  const felt = nFeltSignal(i);
  const rawShape = nShapeSignal(i, ref);
  const shape = nClause(rawShape);
  const rawState = body && felt ? `${nClause(body)} and ${nClause(felt)}` : body ?? felt ?? null;
  const state = rawState ? nClause(rawState) : null;

  if (!state) return `${nCap(shape)}.`;

  // Single-sentence forms only — the four-beat body must stay within 1–3
  // sentences, so evidence and read each occupy one sentence.
  const forms: string[] = [
    `${nCap(state)}; ${shape}.`,
    `${nCap(state)}, with ${shape}.`,
    `${nCap(shape)}, and ${nLower(state)}.`,
  ];
  return nPick(forms, i.variantSeed, `evidence:${i.narrative.family}:${i.window}`);
}

// ── Beat (b) — the read ─────────────────────────────────────────────────────

const NARRATIVE_READS: Record<
  BriefNarrativeFamily,
  { ok: string[]; low: string[]; evening?: string[] }
> = {
  travel_long_haul: {
    ok: [
      "The flight is the cost today, not the meetings.",
      "The day is a transit day with work bolted on the end.",
    ],
    low: [
      "You are spending the day in a seat and arriving to real work — that is the squeeze.",
      "There is not enough in the tank to lose the whole flight to email.",
    ],
    evening: [
      "The flight was the day; what is left of it is recovery, not work.",
      "You have moved a long way today — that is the whole of it.",
    ],
  },
  travel_short_haul: {
    ok: [
      "The travel is short; the switching around it is the real load.",
      "Two transitions, not one long one — that is what costs you.",
    ],
    low: [
      "The flight is short but the day is long, and you are running under.",
      "Short hops on a thin tank are where the edge quietly goes.",
    ],
    evening: [
      "The travel was short; the switching around it is what cost you.",
      "Two transitions in a day is what has taken the edge off.",
    ],
  },
  travel_intercity: {
    ok: [
      "Out and back in a day: the re-entry is the cost, not the distance.",
      "The distance is nothing. Getting your head back is the work.",
    ],
    low: [
      "A same-day return on this little in reserve leaves nothing for the evening.",
      "You will land back with less than you left with.",
    ],
    evening: [
      "You are back with less than you left with — that is the price of the day.",
      "The distance was nothing; getting your head back is tonight's work.",
    ],
  },
  persuasion_pre: {
    ok: [
      "This is a room you win on clarity, not effort.",
      "The pitch does not need more preparation. It needs you unhurried.",
    ],
    low: [
      "You are going into a persuasion room with less than usual to spend.",
      "There is enough for the pitch. There is not enough for the pitch plus everything else.",
    ],
  },
  visibility_pre: {
    ok: [
      "Being watched costs more than the content does.",
      "The room reads your state before it reads your argument.",
    ],
    low: [
      "Visibility on a thin day is where the tightness shows.",
      "You can hold the room, but not if you walk in cold and rushed.",
    ],
    evening: [
      "Being watched costs more than the content did.",
      "The exposure is what took from you today, not the material.",
    ],
  },
  visibility_post: {
    ok: [
      "Coming off a stage leaves you wired, not finished.",
      "That kind of exposure keeps running long after the room empties.",
    ],
    low: [
      "You are past the room and still running hot on nothing.",
      "The stage is done; the charge it left is still spending you.",
    ],
  },
  conference_arc: {
    ok: [
      "These days do not spike — they accumulate.",
      "The sessions are not the load. The people between them are.",
    ],
    low: [
      "The event has been drawing on you for days and today asks for more.",
      "You are further into this than your Internal Buffer is.",
    ],
    evening: [
      "These days do not spike — they accumulate, and today added to it.",
      "The sessions were not the load. The people between them were.",
    ],
  },
  back_to_back: {
    ok: [
      "The compression is the problem, not the meetings.",
      "Nothing today is hard. All of it together is.",
    ],
    low: [
      "A day without gaps on a body without reserve is where quality slips.",
      "There is no room in this day to recover inside it.",
    ],
  },
  weight_heavy: {
    ok: [
      "Few rooms, large consequence. Today is about depth, not throughput.",
      "This is a day where two conversations carry everything.",
    ],
    low: [
      "The rooms are heavy and you are running light.",
      "There is enough for the big rooms only if nothing else takes from them.",
    ],
    evening: [
      "The weight of today sat in two conversations, and they are done.",
      "That was a depth day, not a throughput day.",
    ],
  },
  volume_heavy: {
    ok: [
      "This is volume, not weight — and volume is what eats the day.",
      "Most of today is attendance, not decision.",
    ],
    low: [
      "A full calendar of thin-yield rooms on a thin day is pure leakage.",
      "You cannot afford to spend this state on meetings that decide nothing.",
    ],
  },
  context_switching: {
    ok: [
      "Every switch costs you a few minutes of real thinking.",
      "The jumps between these rooms are what will tire you, not the rooms.",
    ],
    low: [
      "Re-orienting this many times on this little in reserve is where mistakes come from.",
      "The switching cost is steep and your margin for it is thin.",
    ],
  },
  baseline: {
    ok: ["The day is workable as it stands."],
    low: ["There is less to spend today than the calendar assumes."],
  },
};

// ── Beat (c) — the work directive ───────────────────────────────────────────

/**
 * Evening directive: closes the day out. Never front-loads, never sequences a
 * day that has already run. Tomorrow's first move is the only forward reference.
 */
function nEveningDirective(i: NarrativeCopyInput, ref: () => string | null): string {
  const a = i.narrative.aggregates;
  const anchor = ref();
  switch (i.narrative.family) {
    case "travel_long_haul":
    case "travel_short_haul":
    case "travel_intercity":
      return `Keep the rest of the re-entry until the morning and close nothing irreversible tonight`;
    case "persuasion_pre":
      return anchor
        ? `Leave ${anchor} where it is tonight — the argument does not improve after this hour`
        : `Leave the pitch where it is tonight; the argument does not improve after this hour`;
    case "visibility_pre":
      return `Stop rehearsing tonight. Decide the one line you open with and leave the rest`;
    case "visibility_post":
      return `Take nothing consequential tonight and let the charge from the room come down`;
    case "conference_arc":
      return a.eveningSocialLoad
        ? `Give the dinner an hour, then go — tomorrow is another full day of this`
        : `Close the day here and pick tomorrow's first block before you stop`;
    case "back_to_back":
      return `Name tomorrow's first block and close the one decision still open, then stop`;
    case "volume_heavy":
      return `Pick tomorrow's first two priorities and close the calendar; the rest of the volume waits`;
    case "weight_heavy":
      return `Write down where ${anchor ?? "the heavy room"} landed and close that decision tonight; the rest of the work keeps until morning`;
    case "context_switching":
      return `Stop switching. Pick tomorrow's first block and leave the rest until then`;
    default:
      return `Name tomorrow's first move, then close the day out`;
  }
}

/**
 * Afternoon directive: the engine has already started. Only the remaining half
 * of the day can be sequenced — never "before you board", never "front-load".
 */
function nAfternoonDirective(i: NarrativeCopyInput, ref: () => string | null): string {
  const a = i.narrative.aggregates;
  const low = LOW(i.band);
  const anchor = ref();
  switch (i.narrative.family) {
    case "travel_long_haul":
      return i.narrative.phase === "post"
        ? `Take the listening work for the rest of today and defer anything irreversible until tomorrow`
        : `Set what actually matters on landing before you board, and keep the rest of the afternoon light`;
    case "travel_short_haul":
      return `Keep the rest of the afternoon to the meetings already booked and defer new analysis`;
    case "travel_intercity":
      return `Keep the return leg for execution; the decisions are already made`;
    case "persuasion_pre":
      return low
        ? `Protect the hour before ${anchor ?? "the pitch"} and move everything else out of the afternoon`
        : `Go in with the outcome and the first move clear${anchor ? `, and keep the run-up to ${anchor} clean` : ""}`;
    case "visibility_pre":
      return low
        ? `Stop adding to the material and arrive early instead${anchor ? `; ${anchor} needs presence, not more notes` : ""}`
        : `Lead the room on presence, not volume of content, and keep the half hour before it clear`;
    case "visibility_post":
      return `Do not decide anything consequential for the next hour. Take the routine execution work while the charge comes down`;
    case "conference_arc":
      return a.eveningSocialLoad
        ? `Pick the one evening thing worth attending and let the rest of the agenda go`
        : `Keep the afternoon to the sessions that justify being here and skip the corridors`;
    case "back_to_back":
      return low
        ? `Put five minutes between the ones you can still move${anchor ? `, and take ${anchor} first` : ""}. Everything after it can be listening`
        : `Take the irreversible calls in what gaps are left and let the rest run as they are`;
    case "weight_heavy":
      return low
        ? `Carry ${anchor ?? "the heavy room"} and nothing else that needs a decision for the rest of today`
        : `Protect the meetings with consequence and let the rest of the afternoon run light`;
    case "volume_heavy":
      return low
        ? `Cut two of the remaining meetings and protect the one hour that actually produces something`
        : `Shorten what decides nothing and spend the reclaimed hour on the work that compounds`;
    case "context_switching":
      return low
        ? `Group what is left by kind and put five minutes between the ones you cannot move`
        : `Order the rest of the day so the deciding happens before the switching starts`;
    default:
      return low
        ? `Pick the one thing left that cannot wait and do only that`
        : `Spend the rest of the day on the one decision that compounds`;
  }
}

function nMorningDirective(i: NarrativeCopyInput, ref: () => string | null): string {
  const n = i.narrative;
  const a = n.aggregates;
  const low = LOW(i.band);
  const anchor = ref();

  switch (n.family) {
    case "travel_long_haul":
      if (n.phase === "post") {
        return a.meetingsAfterTravel > 0
          ? `Take the listening work first and defer anything irreversible until tomorrow`
          : `Execute the light work and defer decisions until you have slept in place`;
      }
      if (n.phase === "in_transit") {
        return `Use the first hour to decide what actually matters on landing, then stop working`;
      }
      return a.meetingsAfterTravel > 0
        ? `Front-load the decisions before you board, and land with only the listening left${anchor ? ` for ${anchor}` : ""}`
        : `Clear the decisions before you board and let the flight be the gap`;
    case "travel_short_haul":
      if (n.phase === "post") {
        return `Lead the conversations that are already scheduled and defer new analysis to tomorrow`;
      }
      return `Sequence the day around the transitions: decisions before the flight, listening after it`;
    case "travel_intercity":
      return `Take the decisions on the way out while you are fresh, and keep the return leg for execution`;
    case "persuasion_pre":
      return low
        ? `Protect the hour before ${anchor ?? "the pitch"} and carry nothing else into it. Everything else moves`
        : `Go in with the outcome and the first move clear${anchor ? `, and give ${anchor} the clean hour before it` : ""}`;
    case "visibility_pre":
      return low
        ? `Cut the preparation short and arrive early instead${anchor ? `; ${anchor} needs presence, not more notes` : ""}`
        : `Lead the room on presence, not volume of content, and keep the last thirty minutes before it clear`;
    case "visibility_post":
      return `Do not decide anything consequential for the next hour. Take the routine execution work while the charge comes down`;
    case "conference_arc":
      if (a.presentingInsideConference) {
        return `Protect the block before you present and treat the corridors as optional`;
      }
      if (a.eveningSocialLoad) {
        return `Pick the two sessions and the one dinner that matter and let the rest of the agenda go`;
      }
      return low
        ? `Pick the two sessions that justify being here and skip the rest of the agenda`
        : `Lead the conversations you came for and skip the rest of the agenda`;
    case "back_to_back":
      return low
        ? `Sequence the day so the one room that decides something comes first${anchor ? ` — ${anchor}` : ""}. Everything after it can be listening`
        : `Sequence the irreversible calls into the early gaps and let the rest run as they are`;
    case "weight_heavy":
      return low
        ? `Carry ${anchor ?? "the heavy room"} and nothing else that needs a decision. Everything else moves`
        : `Protect the two meetings with consequence and let the rest of the morning run light`;
    case "volume_heavy":
      return low
        ? `Cut two meetings before lunch and protect the one hour that actually produces something`
        : `Decline or shorten what decides nothing, and spend the reclaimed hour on the work that compounds`;
    case "context_switching":
      return low
        ? `Group the similar rooms together where you still can and put five minutes between the ones you cannot move`
        : `Order the day so the deciding happens before the switching starts, and leave a gap either side of ${anchor ?? "the big room"}`;
    default:
      return low
        ? `Pick the one priority that cannot wait and do only that`
        : `Spend the clear window on the one decision that compounds`;
  }
}

function nBuildDirective(i: NarrativeCopyInput, ref: () => string | null): string {
  if (i.window === "evening") return nEveningDirective(i, ref);
  if (i.window === "afternoon") return nAfternoonDirective(i, ref);
  return nMorningDirective(i, ref);
}

// ── Beat (d) — the close. Self-regulation only. 3–8 words. ──────────────────

const NARRATIVE_CLOSES: Record<
  BriefNarrativeFamily,
  { ok: string[]; low: string[]; evening?: string[] }
> = {
  travel_long_haul: {
    ok: ["and land in some kind of shape.", "and keep something back for the other side."],
    low: ["and sleep on the plane, properly.", "and stop working before you land."],
    evening: ["and sleep in place tonight.", "and let the day end here."],
  },
  travel_short_haul: {
    ok: ["and settle yourself between the legs.", "and take the gate time as a gap."],
    low: ["and let the flight be genuinely empty.", "and stop pushing once you land."],
    evening: ["and unpack nothing tonight.", "and let the day end here."],
  },
  travel_intercity: {
    ok: ["and give yourself the train back.", "and come home before you get home."],
    low: ["and let the evening be nothing.", "and shut it down on the way back."],
    evening: ["and let the evening be nothing.", "and get to bed early tonight."],
  },
  persuasion_pre: {
    ok: ["and settle yourself before you walk in.", "and go in unhurried."],
    low: ["and steady yourself in the last ten minutes.", "and slow your first sentence down."],
    evening: ["and let it rest until morning.", "and put it down for tonight."],
  },
  visibility_pre: {
    ok: ["and arrive early enough to settle.", "and steady yourself before the lights."],
    low: ["and get quiet before you go on.", "and keep the ten minutes before it silent."],
    evening: ["and get quiet before you sleep.", "and let it rest until morning."],
  },
  visibility_post: {
    ok: ["and let the charge come down.", "and give yourself twenty quiet minutes."],
    low: ["and shut the laptop early tonight.", "and stop before the adrenaline stops you."],
    evening: ["and let the charge come down.", "and shut the laptop early tonight."],
  },
  conference_arc: {
    ok: ["and take the breaks you are given.", "and keep one hour to yourself."],
    low: ["and skip the drinks tonight.", "and get back to the room early."],
    evening: ["and get back to the room early.", "and skip the final round tonight."],
  },
  back_to_back: {
    ok: ["and steady yourself between the rooms.", "and take the gaps before they go."],
    low: ["and stand up between two of them.", "and stop at the end, not after."],
    evening: ["and stop at the end, not after.", "and give yourself a quiet evening."],
  },
  weight_heavy: {
    ok: ["and hold your line in the big room.", "and settle yourself before you walk in."],
    low: ["and keep your edge for the one room.", "and steady yourself beforehand."],
    evening: ["and put the weight down tonight.", "and give yourself a quiet evening."],
  },
  volume_heavy: {
    ok: ["and don't let small calls chip your edge.", "and keep one hour genuinely yours."],
    low: ["and shut the laptop early tonight.", "and stop answering after six."],
    evening: ["and stop answering tonight.", "and shut the laptop early tonight."],
  },
  context_switching: {
    ok: ["and reset yourself between the jumps.", "and take a minute before each one."],
    low: ["and stop switching once the final room ends.", "and give yourself a quiet evening."],
    evening: ["and give yourself a quiet evening.", "and let your head land tonight."],
  },
  baseline: {
    ok: ["and hold your line when it speeds up.", "and steady yourself between the rooms."],
    low: ["and shut the laptop early tonight.", "and take the gaps before they're gone."],
    evening: ["and let the day end here.", "and give yourself a quiet evening."],
  },
};

/**
 * Render the four beats for a resolved narrative family.
 * Returns null for the `baseline` family so the caller keeps its existing
 * generic path (weekend / off-day / no-calendar copy is unchanged).
 */
export function renderNarrativeBeats(i: NarrativeCopyInput): NarrativeBeats | null {
  const family = i.narrative.family;
  if (family === "baseline") return null;

  // One anchor helper per render — the timing clause is spent once (fix 1).
  const ref = makeAnchorRef(i);

  const low = LOW(i.band) || i.narrative.depletion;
  const reads = NARRATIVE_READS[family];
  const closes = NARRATIVE_CLOSES[family];
  const readBank = i.window === "evening" && reads.evening
    ? reads.evening
    : low
    ? reads.low
    : reads.ok;
  const closeBank = i.window === "evening" && closes.evening
    ? closes.evening
    : low
    ? closes.low
    : closes.ok;

  // Evidence first so the anchor's timing lands in the opening beat when the
  // day shape names it; the directive then reuses the plain reference.
  const evidence = nBuildEvidence(i, ref);
  // Read and Directive are each collapsed to a single dash-free clause so the
  // four-beat body never exceeds the 1–3 sentence budget (beat d rides on the
  // directive's sentence).
  const directive = nClause(nBuildDirective(i, ref));
  const close = nPick(closeBank, i.variantSeed, `close:${family}:${i.window}`);

  // Elastic Lexicon safety: the close must carry at least one pillar concept.
  // Append a short self-regulation clause inside the same sentence so the
  // four-beat structure and sentence count stay intact.
  const closeWithLexicon = detectCluster(close)
    ? close
    : `${close.replace(/\.$/, "")}, ${lexiconFallbackClause("resilience")}.`;

  return {
    evidence,
    read: `${nClause(nPick(readBank, i.variantSeed, `read:${family}:${i.window}`))}.`,
    directive,
    close: closeWithLexicon,
  };
}

/** Assemble the four beats into the body string the Brief renders. */
export function assembleNarrativeBody(b: NarrativeBeats): string {
  return `${b.evidence} ${b.read} ${b.directive}, ${b.close}`;
}
