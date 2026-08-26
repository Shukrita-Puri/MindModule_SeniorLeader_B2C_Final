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
      `Before ${anchor(ctx)}, run a 60-second honest internal audit: ` +
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
      `Circadian re-entry day — prefrontal capacity is running below what the calendar assumes.`,
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
      `Elevated emotional proxy with ${anchor(ctx)} on today's calendar.`,
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
      `Treat recovery as the first deliverable before ${anchor(ctx)}; ` +
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
    close: () => `name the friction, move it`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §2.17  BOARD-LEVEL OUTCOME
  // Signal: any stakes_level board/external/investor within 24h
  // ───────────────────────────────────────────────────────────────────────────
  boardLevelOutcome: {
    evidence: (ctx) =>
      `${anchor(ctx)} is within 24 hours; every choice today is a preparation input.`,
    read: (ctx) =>
      `Board-level rooms read leaders as signals before they read them as speakers.`,
    directive: (ctx) =>
      `Frame every decision today through one question: does this build or erode ` +
      `the executive presence that room requires?`,
    close: () => `every choice is prep`,
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
    close: () => `close each frame before switching`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // §5.2 / §7  INTERPERSONAL MEETING CONTEXT
  // Signal: categoryId === 'D' or isInterpersonal, especially before high-stakes
  // ───────────────────────────────────────────────────────────────────────────
  interpersonalMeetingContext: {
    evidence: (ctx) =>
      `${anchor(ctx)} is a high-drain interpersonal conversation ` +
      `with a high-stakes event following it.`,
    read: (ctx) =>
      `Emotional activation state from this meeting will leak into the next room.`,
    directive: (ctx) =>
      `Build a hard 15-minute buffer after this before any decision or performance moment — ` +
      `use it to discharge, not debrief.`,
    close: () => `buffer is a leadership variable`,
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
    close: () => `sequence the irreversible last`,
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
    close: () => `protect whatever gaps remain`,
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
    close: () => `each moment gets its own prep`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CONFERENCE DEPLETION
  // Signal: multi-day conference; cumulative depletion by day N
  // ───────────────────────────────────────────────────────────────────────────
  conferenceDepletion: {
    evidence: (ctx) =>
      `Day ${confDay(ctx)} of a multi-day event; cumulative social performance load compounding.`,
    read: (ctx) =>
      `Conference fatigue hits the interpersonal read first — ` +
      `the most expensive capacity to lose at an external event.`,
    directive: (ctx) =>
      `Front-load conversations requiring emotional presence; ` +
      `let the end of the day run on process, not performance.`,
    close: () => `your energy is the signal`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CONFERENCE DAY LOAD
  // Signal: single conference or public event day
  // ───────────────────────────────────────────────────────────────────────────
  conferenceDayAttend: {
    evidence: (ctx) =>
      `Full public-performance day — every corridor interaction is a stakeholder moment.`,
    read: (ctx) =>
      `Informal interactions carry disproportionate weight because they're read as unguarded truth.`,
    directive: (ctx) =>
      `Manage visible state deliberately — presence, composure, and eye contact ` +
      `are the primary signals stakeholders will carry from today.`,
    close: () => `you are the signal today`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // VISIBILITY / COMMUNICATIONS WINDOW
  // Signal: keynote, media, town hall, all-hands
  // ───────────────────────────────────────────────────────────────────────────
  visibilityCommsPrep: {
    evidence: (ctx) =>
      `${anchor(ctx)} is a high-visibility moment — words and presence read beyond the room.`,
    read: (ctx) =>
      `Town halls are culture delivery, not information delivery — ` +
      `emotional register is what people feel, repeat, and act on.`,
    directive: (ctx) =>
      `Identify the one idea every person should leave with; ` +
      `activate storytelling mode, not reporting mode.`,
    close: () => `tone sets the culture`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // INFLUENCE & PERSUASION WINDOW
  // Signal: pitch, negotiation, high-stakes presentation
  // ───────────────────────────────────────────────────────────────────────────
  influencePersuasionPrep: {
    evidence: (ctx) =>
      `${anchor(ctx)} is a persuasion-mode event — the goal is position shift, not information transfer.`,
    read: (ctx) =>
      `Low confidence reads as low conviction; visible anxiety reads as low credibility.`,
    directive: (ctx) =>
      `Anchor your confidence state and frame the ask clearly in your own mind ` +
      `before you walk in — high activation is useful here.`,
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
      `${anchor(ctx)} approaching — a room where you report up, not down.`,
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
    close: () => `48 hours shapes the room`,
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
    close: () => `rest is performance investment`,
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
    close: () => `total load, not primary load`,
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
