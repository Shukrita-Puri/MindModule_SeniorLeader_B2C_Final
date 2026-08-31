/**
 * Canonical Availability Classifier (SSOT).
 *
 * Answers: "Is the user actually working today, and if so under what workload?"
 *
 * Consumed by:
 *   - generate-mastery-plan (planner) — feeds `hasRestSignals` into slot allocator
 *   - _shared/brief-signal-coverage    — gates PTO/holiday brief signals
 *   - _shared/ceo-behaviour/pto-holiday — gates reduced-touch framing
 *   - smart-nudges                     — gates nudge cadence
 *
 * Design principle: availability is decided by evidence, not workload.
 * Meeting counts and empty calendars are workload signals — they NEVER
 * decide whether the user is working. See docs section "Canonical Override
 * Principle" in the ticket for the precedence rules.
 *
 * SINGLE-FILE SSOT: this file OWNS the title regexes (PTO_TITLE_RX,
 * PERSONAL_HOLIDAY_TITLE_RX), the region-token type and helpers
 * (RegionToken, parseHolidayRegionFromTitle, isFyiHolidayCalendar,
 * matchesUserCountry, isApplicableHoliday), the classifier core, and the
 * classifyDay adapter. `holiday-applicability.ts` and the regex exports on
 * `ceo-behaviour/pto-holiday.ts` are @deprecated re-export shims kept for
 * one release; do NOT import from them.
 *
 * Size ceiling: keep this file under ~500 lines. If new rules push past
 * that, split internals into an `availability/` sub-folder
 * (regex.ts / regions.ts / classifier-core.ts) and keep this file as the
 * public re-export barrel so consumers keep ONE import path.
 */

// ────────────────────────────────────────────────────────────────────────
// Title regexes — canonical PTO / public-holiday markers.
// Moved here from ceo-behaviour/pto-holiday.ts so availability primitives
// live in one place. That file now re-exports these for back-compat.
// ────────────────────────────────────────────────────────────────────────

/**
 * Canonical PTO / public-holiday title regex. Detects whether a calendar
 * event title represents an off-day marker (OOO / PTO / Vacation /
 * Holiday / Out of Office / Bank Holiday / etc.).
 *
 * Consumers MUST import this from `availability-classifier.ts`.
 */
export const PTO_TITLE_RX =
  /\b(ooo|out\s*of\s*office|pto|vacation|annual\s+leave|on\s+leave|holiday|public\s+holiday|bank\s+holiday|national\s+holiday)\b/i;

/**
 * Personal-leaning subset of {@link PTO_TITLE_RX}: vacation / annual leave /
 * on leave / public|bank|national holiday / plain "holiday". Excludes
 * OOO|PTO|out of office which often still imply a work-arc.
 */
export const PERSONAL_HOLIDAY_TITLE_RX =
  /\b(vacation|annual\s+leave|on\s+leave|public\s+holiday|bank\s+holiday|national\s+holiday|holiday)\b/i;

// ────────────────────────────────────────────────────────────────────────
// Region tokens + holiday applicability helpers.
// Moved here verbatim from holiday-applicability.ts.
// ────────────────────────────────────────────────────────────────────────

/** Region tokens the classifier understands. Extend as needed. */
export type RegionToken =
  | "GB"        // United Kingdom umbrella
  | "GB-ENG"    // England
  | "GB-WLS"    // Wales
  | "GB-SCT"    // Scotland
  | "GB-NIR"    // Northern Ireland
  | "US"        // United States
  | "IE"        // Ireland
  | "UNKNOWN";

/**
 * Parse a region qualifier from a holiday title.
 *   "Bank Holiday (N Ireland)"       -> "GB-NIR"
 *   "Bank Holiday (Scotland)"        -> "GB-SCT"
 *   "Bank Holiday (England & Wales)" -> "GB-ENG"
 *   "US Independence Day"            -> "US"
 * Returns UNKNOWN when no explicit qualifier is present.
 */
export function parseHolidayRegionFromTitle(
  title: string | null | undefined,
): RegionToken {
  if (!title) return "UNKNOWN";
  const t = title.toLowerCase();
  if (/\(n\.?\s*ireland\)|\bnorthern ireland\b/.test(t)) return "GB-NIR";
  if (/\(scotland\)|\bscotland\b/.test(t)) return "GB-SCT";
  // England & Wales umbrella must be checked before plain Wales/England.
  if (/\(england\s*&\s*wales\)|\bengland\s*&\s*wales\b/.test(t)) return "GB-ENG";
  if (/\(wales\)|\bwales\b/.test(t)) return "GB-WLS";
  if (/\(england\)|\bengland\b/.test(t)) return "GB-ENG";
  if (/\(uk\)|\bunited kingdom\b/.test(t)) return "GB";
  if (/\(us\)|\bunited states\b|\bu\.s\.\b/.test(t) || /^us\s/i.test(title))
    return "US";
  if (/\(ireland\)|\brepublic of ireland\b/.test(t)) return "IE";
  return "UNKNOWN";
}

/**
 * Feed names that contain the word "holiday" but are ordinary WORK calendars.
 * Checked before the positive match so a "Holiday cover rota" is never
 * mistaken for a subscribed public-holiday feed.
 */
const NON_FYI_CALENDAR_RX =
  /\b(cover|rota|rot[a]?s|planner|planning|tracker|request|requests|booking|bookings|approval|approvals|schedule\s+cover|leave\s+tracker)\b/;

/**
 * Detect an FYI subscription calendar (Google/Apple holiday feeds).
 *
 * Matches the CALENDAR FEED NAME only — never the event title. Real feeds in
 * the wild are named "Holidays in United Kingdom", "UK Holidays",
 * "Australian Holidays", "Public Holidays", "Holidays (United States)".
 *
 * `calendarTitle` is the field the app persists on
 * `calendar_events.event_metadata`; `source` / `calendarSummary` are the
 * legacy names. All three are accepted so every caller sees the same answer.
 */
export function isFyiHolidayCalendar(event: {
  source?: string | null;
  calendarSummary?: string | null;
  calendarTitle?: string | null;
}): boolean {
  const s = `${event.source ?? ""} ${event.calendarSummary ?? ""} ${
    event.calendarTitle ?? ""
  }`.toLowerCase().trim();
  if (!s) return false;
  if (NON_FYI_CALENDAR_RX.test(s)) return false;
  return /\bholidays?\b/.test(s);
}


/**
 * Determine whether a subscription/title region matches the user's country.
 * Handles GB umbrella <-> GB-* subdivisions.
 */
export function matchesUserCountry(
  region: RegionToken,
  userCountry: string | null | undefined,
): boolean {
  if (!userCountry) return false;
  const u = userCountry.toUpperCase();
  if (region === "UNKNOWN") return false;
  if (region === u) return true;
  if (region === "GB" && u.startsWith("GB")) return true;
  if (u === "GB" && region.startsWith("GB")) return true;
  return false;
}

/**
 * Decide whether a holiday-like event is applicable to the user.
 *   - Non-all-day events NEVER count.
 *   - FYI subscription calendars: applicable only if the feed's country
 *     matches the user; otherwise informational.
 *   - Region-qualified titles: applicable only when the region matches.
 *   - Unqualified titles from a non-FYI calendar: applicable.
 */
export function isApplicableHoliday(
  event: {
    title: string;
    isAllDay?: boolean;
    source?: string | null;
    calendarSummary?: string | null;
    calendarTitle?: string | null;
  },
  userCountry: string | null | undefined,
): { applicable: boolean; region: RegionToken; reason: string } {
  if (!event.isAllDay) {
    return { applicable: false, region: "UNKNOWN", reason: "not_all_day" };
  }
  const titleRegion = parseHolidayRegionFromTitle(event.title);
  const fyi = isFyiHolidayCalendar(event);

  if (fyi) {
    const summary = `${event.source ?? ""} ${event.calendarSummary ?? ""} ${
      event.calendarTitle ?? ""
    }`.toLowerCase();
    const feedRegion: RegionToken =
      /united kingdom|\buk\b|\bgb\b|\bbritain\b/.test(summary)
        ? "GB"
        : /united states|\bus\b|\busa\b/.test(summary)
        ? "US"
        : /ireland/.test(summary)
        ? "IE"
        : titleRegion;

    const match =
      matchesUserCountry(feedRegion, userCountry) ||
      matchesUserCountry(titleRegion, userCountry);
    return {
      applicable: match,
      region: feedRegion === "UNKNOWN" ? titleRegion : feedRegion,
      reason: match ? "fyi_matches_user_country" : "fyi_foreign_country",
    };
  }

  if (titleRegion !== "UNKNOWN") {
    const match = matchesUserCountry(titleRegion, userCountry);
    return {
      applicable: match,
      region: titleRegion,
      reason: match ? "region_matches_user_country" : "region_foreign",
    };
  }

  return { applicable: true, region: "UNKNOWN", reason: "unqualified_all_day" };
}

export type AvailabilityState =
  | "WORKDAY"
  | "LIGHT_ROUTINE"
  | "REST_DAY"
  | "PTO"
  | "PUBLIC_HOLIDAY";

export interface AvailabilityEvent {
  title: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  isOrganizer?: boolean;
  attendeesCount?: number;
  source?: string | null;
  calendarSummary?: string | null;
}

export interface AvailabilityInput {
  now: Date;
  /** Local weekend days; default = Saturday only. Sunday intentionally not
   *  a rest day by default (many executives plan the week on Sunday). */
  weekendDays?: number[];
  /** Home country from profiles.country. Nullable. */
  userHomeCountry?: string | null;
  /** Reserved for future Travel SSOT. Falls back to home when unset. */
  userCurrentCountry?: string | null;
  events: AvailabilityEvent[];
  /** User-approved PTO/annual-leave (from future onboarding/UI). */
  explicitPto?: boolean;
  /** Workload hint from upstream calendar-load classifier. */
  calendarLoad?: "low" | "medium" | "high" | string | null;
}

export interface AvailabilityResult {
  state: AvailabilityState;
  isRestDay: boolean;
  workEvidence: { meetingCount: number; hasWorkMeetings: boolean };
  holiday: {
    detected: boolean;
    applicable: boolean;
    title?: string;
    scope?: RegionToken;
  };
  reason: string;
}

const WORK_MEETING_MIN = 2;

function isTimedWorkMeeting(e: AvailabilityEvent): boolean {
  if (e.isAllDay === true) return false;
  // A timed event counts as work when the user is organiser or the event
  // has other attendees. Focus-only blocks (no attendees, not organiser)
  // are workload, not availability evidence.
  if (e.isOrganizer === true) return true;
  if ((e.attendeesCount ?? 0) >= 1) return true;
  return false;
}

function looksLikeHolidayMarker(e: AvailabilityEvent): boolean {
  if (e.isAllDay !== true) return false;
  const title = e.title || "";
  if (PTO_TITLE_RX.test(title) || PERSONAL_HOLIDAY_TITLE_RX.test(title)) return true;
  // Any all-day event on an FYI holiday-subscription calendar (e.g.
  // "Holidays in United Kingdom") is a holiday marker even when the title
  // isn't a PTO regex match — e.g. "Christmas Day", "Independence Day".
  return isFyiHolidayCalendar(e);
}

/**
 * Classify the user's availability state.
 *
 * Precedence (top-down, first match wins):
 *   1. Calendar work evidence (≥2 timed work meetings) → WORKDAY.
 *      Overrides weekend, PTO marker, holiday.
 *   2. Explicit user intent (explicitPto) → PTO. Travel never overrides PTO.
 *   3. Applicable public holiday → PUBLIC_HOLIDAY.
 *   4. Weekend day → REST_DAY.
 *   5. Workload split → LIGHT_ROUTINE (low/empty) or WORKDAY.
 */
export function classifyAvailability(
  input: AvailabilityInput,
): AvailabilityResult {
  const events = input.events || [];
  const weekendDays = input.weekendDays ?? [6];
  const dow = input.now.getDay();
  const country = input.userCurrentCountry ?? input.userHomeCountry ?? null;

  // Step 1 — calendar work evidence.
  const workMeetings = events.filter(isTimedWorkMeeting);
  const meetingCount = workMeetings.length;
  const hasWorkMeetings = meetingCount >= WORK_MEETING_MIN;

  // Holiday detection (needed for both step 3 and the returned envelope).
  let holidayDetected = false;
  let holidayApplicable = false;
  let holidayTitle: string | undefined;
  let holidayScope: RegionToken | undefined;
  for (const e of events) {
    if (!looksLikeHolidayMarker(e)) continue;
    holidayDetected = true;
    const app = isApplicableHoliday(e, country);
    if (app.applicable) {
      holidayApplicable = true;
      holidayTitle = e.title;
      holidayScope = app.region;
      break;
    }
    // Track the first detected marker for observability even if not applicable.
    if (!holidayTitle) {
      holidayTitle = e.title;
      holidayScope = app.region;
    }
  }

  const isWeekend = weekendDays.includes(dow);

  // Step 1 override — work meetings beat weekend / PTO / holiday.
  if (hasWorkMeetings) {
    return {
      state: "WORKDAY",
      isRestDay: false,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: holidayApplicable,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: `work_evidence_override:${meetingCount}_meetings`,
    };
  }

  // Step 2 — explicit PTO. Travel never overrides.
  if (input.explicitPto === true) {
    return {
      state: "PTO",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: holidayApplicable,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: "explicit_pto",
    };
  }

  // Step 3 — applicable public holiday.
  if (holidayApplicable) {
    return {
      state: "PUBLIC_HOLIDAY",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: true,
        applicable: true,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: `applicable_holiday:${holidayScope ?? "UNKNOWN"}`,
    };
  }

  // Step 4 — weekend.
  if (isWeekend) {
    return {
      state: "REST_DAY",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: false,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: "weekend",
    };
  }

  // Step 5 — workload split. Never a rest day.
  const isLight =
    events.length === 0 ||
    input.calendarLoad === "low" ||
    !events.some(isTimedWorkMeeting);
  return {
    state: isLight ? "LIGHT_ROUTINE" : "WORKDAY",
    isRestDay: false,
    workEvidence: { meetingCount, hasWorkMeetings },
    holiday: {
      detected: holidayDetected,
      applicable: false,
      title: holidayTitle,
      scope: holidayScope,
    },
    reason: isLight ? "workday_light_routine" : "workday_normal",
  };
}

/**
 * Convenience adapter: given a classifier input, return the boolean
 * `hasRestSignals` value expected by the slot allocator. This is the
 * single planner-boundary surface that used to compute the flag from
 * `calendarLoad === 'low' && events.length === 0`.
 */
export function classifyHasRestSignals(input: AvailabilityInput): boolean {
  return classifyAvailability(input).isRestDay;
}

/**
 * Thin adapter around `classifyAvailability` for consumers that need to
 * classify an ARBITRARY calendar day (not just "now") — e.g. the
 * smart-nudges 14-day lookback that decides whether each preceding day
 * was an off-day.
 *
 * Returns `{ state, isOffDay }` where `isOffDay` is the canonical
 * definition used across Brief / Plan / Nudges:
 *   OFF ⇔ state ∈ { PTO, PUBLIC_HOLIDAY (applicable), REST_DAY (weekend) }
 * WORKDAY and LIGHT_ROUTINE are NEVER off-days, even when the calendar
 * is empty. Empty calendar ≠ off-day.
 */
export function classifyDay(
  input: AvailabilityInput,
): { state: AvailabilityState; isOffDay: boolean; reason: string } {
  const r = classifyAvailability(input);
  const isOffDay =
    r.state === "PTO" ||
    r.state === "PUBLIC_HOLIDAY" ||
    r.state === "REST_DAY";
  return { state: r.state, isOffDay, reason: r.reason };
}

/**
 * Long-weekend detector.
 *
 * Given a chronologically-ordered array of already-classified previous
 * days (oldest → newest, NOT including today) and today's own state,
 * returns true iff:
 *
 *   - today is an off-day (PTO / applicable public holiday / weekend), AND
 *   - tomorrow is a workday (caller-supplied), AND
 *   - the contiguous off-day block that ends today contains BOTH:
 *       • at least one normal weekend day (REST_DAY), AND
 *       • at least one PTO or applicable PUBLIC_HOLIDAY day
 *
 * A plain Saturday+Sunday weekend is NOT a long weekend. A weekday PTO
 * alone is NOT a long weekend. This matches the product definition:
 * a "long weekend" is a weekend extended by a public holiday or PTO.
 *
 * The helper is intentionally pure — the caller (smart-nudges) walks
 * the calendar, classifies each day via `classifyDay`, and passes the
 * result in. Empty calendars never count as off-days (SSOT rule).
 */
export function isLastDayOfLongWeekend(input: {
  today: { state: AvailabilityState };
  tomorrowIsWorkday: boolean;
  /** Prior days newest-first (yesterday, day-before, …). Bounded ≤ 14. */
  priorDays: Array<{ state: AvailabilityState }>;
}): boolean {
  const isOff = (s: AvailabilityState) =>
    s === "PTO" || s === "PUBLIC_HOLIDAY" || s === "REST_DAY";
  if (!isOff(input.today.state)) return false;
  if (input.tomorrowIsWorkday !== true) return false;

  // Walk backwards through the contiguous off-day block ending today.
  const block: AvailabilityState[] = [input.today.state];
  for (const d of input.priorDays) {
    if (!isOff(d.state)) break;
    block.push(d.state);
  }
  const hasWeekend = block.some((s) => s === "REST_DAY");
  const hasPtoOrHoliday = block.some(
    (s) => s === "PTO" || s === "PUBLIC_HOLIDAY",
  );
  return hasWeekend && hasPtoOrHoliday;
}