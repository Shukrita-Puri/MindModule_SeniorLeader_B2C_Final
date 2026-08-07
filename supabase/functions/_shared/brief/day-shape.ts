// OWNERSHIP: engineering. READ-ONLY projection of the day-awareness signals
// the Plan (JIT v2) already uses, shaped for the Brief LLM prompt.
//
// HARD RULE — this module detects NOTHING. Every field it reads is already
// computed by `_shared/brief-signal-coverage.ts` (`buildSignalMatrix`) and
// consumed by the Plan. It only selects, orders, and labels those flags so
// the Brief and the Plan tell the user ONE story about the shape of the day.
//
// HARD RULE — internal A–H event categories are never surfaced as letters in
// user-visible copy. `formatDayShapeBlock` describes them in plain words.

import type { SignalMatrix } from '../brief-context.ts';

export type DayShape =
  | 'workday'
  | 'weekend'
  | 'public_holiday'
  | 'pto'
  | 'personal_holiday'
  | 'work_travel'
  | 'personal_travel'
  | 'conference';

export type TravelPhase = 'pre' | 'in_transit' | 'post' | null;

export interface DayShapeResult {
  shape: DayShape;
  /** True for public holiday / PTO / personal holiday / personal travel / weekend. */
  isNonWorkday: boolean;
  travelPhase: TravelPhase;
  /** Plain-language rationale for the shape (never shown to the user). */
  reason: string;
  holidayName: string | null;
  /** A meeting breaks an otherwise off day. */
  meetingOnOffDay: boolean;
  conferenceDayNumber: number | null;
  conferenceTotalDays: number | null;
  conferenceTitle: string | null;
  travelTier: 'long_haul' | 'short_haul' | 'short_haul_round_trip' | null;
  longHaul: boolean;
  nextTravelEventTitle: string | null;
  /** Today holds an all-day / full-day blocking event. */
  hasFullDayEvent: boolean;
  /** A high-stakes event sits inside the next 24h (category letter never exposed). */
  hasHighStakesEvent: boolean;
}

export interface DayShapeContext {
  isPublicHoliday?: boolean;
  holidayName?: string | null;
  isWeekend?: boolean;
}

/**
 * Project the already-computed signal matrix onto one canonical day shape.
 *
 * Precedence mirrors the Plan's own ordering:
 *   personal holiday / PTO > public holiday > conference > travel > weekend > workday
 */
export function deriveDayShape(
  signals: SignalMatrix | null | undefined,
  ctx: DayShapeContext = {},
): DayShapeResult {
  const s = signals ?? ({} as SignalMatrix);

  const travelPhase = deriveTravelPhase(s);
  const conferenceDayNumber = s.conferenceDayNumber ?? null;
  const isConferenceToday =
    conferenceDayNumber != null || s.hasFullDayConferenceWrapper === true;
  const travelToday =
    s.travelDay === true ||
    s.workTravelInferred === true ||
    s.travelLandingDetected === true ||
    s.preFlightWindowMinutes != null ||
    !!s.nextTravelEventTitle;

  const base = {
    travelPhase,
    holidayName: ctx.holidayName ?? null,
    meetingOnOffDay: s.ptoMeetingPresent === true,
    conferenceDayNumber,
    conferenceTotalDays: s.conferenceTotalDays ?? null,
    conferenceTitle: s.conferenceEventTitle ?? null,
    travelTier: s.travelTier ?? null,
    longHaul: !!s.longHaulFlight,
    nextTravelEventTitle: s.nextTravelEventTitle ?? null,
    hasFullDayEvent:
      s.ptoTodayAllDay === true || s.hasFullDayConferenceWrapper === true,
    hasHighStakesEvent:
      !!s.highStakesEventInNext24h || s.isHighVisibilityToday === true,
  };

  // 1 — Personal holiday / vacation (user is off, not working).
  if (s.personalHolidayInferred === true) {
    return {
      ...base,
      shape: 'personal_holiday',
      isNonWorkday: true,
      reason: 'personal holiday / vacation marker on today\'s calendar',
    };
  }

  // 2 — PTO / OOO all-day block.
  if (s.ptoTodayAllDay === true || s.ptoModeToday === true) {
    return {
      ...base,
      shape: 'pto',
      isNonWorkday: true,
      reason: base.meetingOnOffDay
        ? 'all-day PTO / OOO with one meeting still scheduled'
        : 'all-day PTO / OOO block on today\'s calendar',
    };
  }

  // 3 — Public holiday (location-aware lookup done upstream).
  if (ctx.isPublicHoliday === true) {
    return {
      ...base,
      shape: 'public_holiday',
      isNonWorkday: true,
      reason: ctx.holidayName
        ? `public holiday: ${ctx.holidayName}`
        : 'public holiday in the user\'s current location',
    };
  }

  // 4 — Conference / summit day.
  if (isConferenceToday) {
    return {
      ...base,
      shape: 'conference',
      isNonWorkday: false,
      reason:
        conferenceDayNumber != null && base.conferenceTotalDays != null
          ? `conference day ${conferenceDayNumber} of ${base.conferenceTotalDays}`
          : 'full-day conference / summit block today',
    };
  }

  // 5 — Travel, split by type using the Plan's post-travel-meeting rule.
  if (travelToday) {
    if (s.workTravelInferred === true) {
      return {
        ...base,
        shape: 'work_travel',
        isNonWorkday: false,
        reason: 'travel today with a meeting scheduled after landing',
      };
    }
    return {
      ...base,
      shape: 'personal_travel',
      isNonWorkday: true,
      reason: 'travel today with no work commitment after landing',
    };
  }

  // 6 — Weekend (locale-aware; resolved upstream).
  if (ctx.isWeekend === true) {
    return {
      ...base,
      shape: 'weekend',
      isNonWorkday: true,
      reason: 'locale weekend day',
    };
  }

  return {
    ...base,
    shape: 'workday',
    isNonWorkday: false,
    reason: 'ordinary working day',
  };
}

function deriveTravelPhase(s: SignalMatrix): TravelPhase {
  if (s.preFlightWindowMinutes != null) return 'pre';
  if (s.inFlightConnectionMinutes != null) return 'in_transit';
  if (s.travelLandingDetected === true) return 'in_transit';
  if (s.yesterdayWasTravelDay === true || s.postTripReentryRisk === true) {
    return 'post';
  }
  if (s.nextTravelEventTitle) return 'pre';
  return null;
}

/**
 * Render the `=== DAY SHAPE ===` prompt block. Plain words only — never an
 * A–H category letter, never a numeric score.
 */
export function formatDayShapeBlock(d: DayShapeResult): string {
  const lines: string[] = [
    '',
    '',
    '=== DAY SHAPE (deterministic; same signals the Plan uses) ===',
    `Shape: ${SHAPE_LABEL[d.shape]} — ${d.reason}`,
  ];

  if (d.travelPhase) {
    const phase = d.travelPhase === 'pre'
      ? 'before departure'
      : d.travelPhase === 'in_transit'
      ? 'in transit / just landed'
      : 'post-trip re-entry';
    const tier = d.longHaul
      ? ' · long-haul'
      : d.travelTier === 'short_haul_round_trip'
      ? ' · same-day round trip'
      : d.travelTier === 'short_haul'
      ? ' · short-haul'
      : '';
    const title = d.nextTravelEventTitle ? ` · "${d.nextTravelEventTitle}"` : '';
    lines.push(`Travel phase: ${phase}${tier}${title}`);
  }

  if (d.conferenceDayNumber != null) {
    const total = d.conferenceTotalDays != null ? ` of ${d.conferenceTotalDays}` : '';
    const title = d.conferenceTitle ? ` — "${d.conferenceTitle}"` : '';
    lines.push(`Conference: day ${d.conferenceDayNumber}${total}${title}`);
  }

  lines.push(`Full-day blocking event today: ${d.hasFullDayEvent ? 'yes' : 'no'}`);
  lines.push(
    `High-stakes event in the next 24h: ${d.hasHighStakesEvent ? 'yes' : 'no'}`,
  );
  if (d.meetingOnOffDay) {
    lines.push('One meeting still breaks this otherwise off day.');
  }
  lines.push(
    'Internal event categories (A–H) are reasoning aids only — never print a category letter in the output.',
  );
  return lines.join('\n');
}

const SHAPE_LABEL: Record<DayShape, string> = {
  workday: 'working day',
  weekend: 'weekend (non-workday)',
  public_holiday: 'public holiday (non-workday)',
  pto: 'PTO / out of office (non-workday)',
  personal_holiday: 'personal holiday / vacation (non-workday)',
  work_travel: 'work travel day',
  personal_travel: 'personal travel day (non-workday)',
  conference: 'conference / summit day',
};