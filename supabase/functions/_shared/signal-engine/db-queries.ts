// MRS v2 §5.1 — DB query helpers for the signal engine.
//
// Hosts the calendar-metrics fetch that was previously inlined in
// `compute-outer-readiness/index.ts`. Other functions (inner readiness,
// smart nudges, mastery-plan generator) can now reuse the exact same
// active-connection / staleness / high-stakes ranking logic without
// duplicating it.
//
// This module owns ONLY the read side. Writes belong in the function that
// owns the workflow (e.g. snapshot upserts live in build-daily-context).

import {
  isNoiseTitle,
  rankByStakes,
  survivesAttendeeOrDurationFloor,
} from '../events/event-classifier.ts';
import { computeCalendarDemand } from './demand-scorer.ts';
import { computeCognitiveFragmentation } from './cognitive-fragmentation.ts';
import type { CalendarLevel } from './context-builder.ts';
import { coarseEventType } from '../events/event-classifier.ts';
import { enrichEvent } from '../events/enrich-event.ts';
import { countLoadUnits, mergeCalendarEvents } from '../rules/calendarEvents.ts';
import {
  classifyAvailability,
  isFyiHolidayCalendar,
  type AvailabilityEvent,
  type AvailabilityResult,
} from '../availability/availability-classifier.ts';
import {
  isPersonalHolidayTitle,
  isPtoOrHolidayTitle,
} from '../ceo-behaviour/pto-holiday.ts';


export interface CalendarMetricsResult {
  load: CalendarLevel;
  pressure: CalendarLevel;
  eventCount: number;
  /** Filtered: excludes all-day blocks and personal blocks. */
  meetingCount: number;
  remainingMeetings: number;
  state: 'active' | 'connected_no_events' | 'not_connected';
  highStakesEvents: string[];
  remainingEvents: number;
  remainingHighStakes: string[];
  /** MRS v2 §3.5 — cognitive fragmentation score (0–100) from today's events. */
  fragmentationScore: number;
  /** Count of < 15-min gaps between adjacent meetings today. */
  shortGapCount: number;
  /** Total wall-clock hours inside back-to-back meeting chains today. */
  backToBackHours: number;
  /**
   * Raw event slice for the day, normalised for shared-module consumers
   * (CEO behaviour snapshot, event taxonomy formatter, window context).
   * Empty when calendar is disconnected or has no events.
   */
  briefEvents: BriefEventLite[];
  /**
   * Pass-through of the raw rows (same columns the demand scorer / classifier
   * accept). Useful when callers want to reuse classification helpers
   * without re-fetching the table.
   */
  rawEvents: any[];
  /**
   * THE filtered load-bearing list — FYI markers, travel and noise removed.
   * Every downstream count (deterministic copy, LLM prompt, pills) must read
   * this rather than re-filtering `rawEvents`.
   */
  loadBearingEvents: any[];
  /** Number of FYI markers (holidays / PTO) removed from load today. */
  fyiMarkerCount: number;
  /** Titles of the FYI markers removed — used for holiday framing + logging. */
  fyiMarkerTitles: string[];
  /**
   * Canonical availability state for the day (availability SSOT). Drives the
   * Brief's framing: a home-country public holiday is an off-day even though
   * it contributes zero load.
   */
  availability: AvailabilityResult | null;
}


export interface BriefEventLite {
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  /** 'board' | 'investor' | 'external' | null — drives high-stakes CEO rules. */
  stakesLevel: 'board' | 'investor' | 'external' | null;
}

/**
 * Project raw `primary_calendar_events` rows into the lite shape consumed
 * by SignalCoverageInput / window-context builders / format-taxonomy.
 * Stakes level is derived from the shared `coarseEventType` classifier.
 */
export function toBriefEvents(events: any[]): BriefEventLite[] {
  const out: BriefEventLite[] = [];
  for (const e of events ?? []) {
    const title = (e?.title ?? '').toString();
    if (!title) continue;
    const startRaw = e.start_time;
    const endRaw = e.end_time ?? e.start_time;
    const startMs = new Date(startRaw).getTime();
    const endMs = new Date(endRaw).getTime();
    if (!Number.isFinite(startMs)) continue;
    const durMin = Number.isFinite(endMs) ? Math.max(0, (endMs - startMs) / 60000) : 0;
    const coarse = coarseEventType(title);
    let stakesLevel: BriefEventLite['stakesLevel'] = null;
    if (coarse === 'board') stakesLevel = 'board';
    else if (coarse === 'investor') stakesLevel = 'investor';
    else if (
      coarse === 'ma' || coarse === 'fundraising' || coarse === 'client' ||
      coarse === 'media-interview' || coarse === 'speaking' || coarse === 'crisis'
    ) stakesLevel = 'external';
    out.push({
      title,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(Number.isFinite(endMs) ? endMs : startMs).toISOString(),
      isAllDay: durMin >= 23 * 60,
      stakesLevel,
    });
  }
  return out;
}

// Loose DB shape so this module doesn't pull the supabase-js client type.
type AnySupabase = {
  from: (table: string) => any;
};

/** All-day accommodation legs the classifier doesn't tag as travel. */
const STAY_RX = /\b(hotel|airbnb|check[- ]?in|check[- ]?out|stay at|accommodation)\b/i;

export function isAllDayEvent(e: any): boolean {
  if (e?.is_all_day === true || e?.isAllDay === true || e?.all_day === true) return true;
  const startMs = new Date(e?.start_time ?? e?.startTime).getTime();
  const endMs = new Date(e?.end_time ?? e?.endTime ?? e?.start_time ?? e?.startTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return (endMs - startMs) / 60000 >= 23 * 60;
}

/** Calendar feed name as stored on `calendar_events.event_metadata`. */
function calendarFeedName(e: any): string | null {
  const md = e?.event_metadata ?? e?.eventMetadata ?? null;
  return (
    e?.calendarTitle ??
    e?.calendar_title ??
    md?.calendarTitle ??
    md?.calendar_title ??
    md?.calendarSummary ??
    md?.calendarName ??
    null
  );
}

/**
 * Normalise a raw `calendar_events` row into the shape the availability SSOT
 * consumes. Single adapter — every caller in this module uses it so the load
 * verdict, the meeting count and the narrative all see identical inputs.
 */
export function toAvailabilityEvent(e: any): AvailabilityEvent {
  return {
    title: String(e?.title ?? ''),
    startTime: String(e?.start_time ?? e?.startTime ?? ''),
    endTime: String(e?.end_time ?? e?.endTime ?? e?.start_time ?? e?.startTime ?? ''),
    isAllDay: isAllDayEvent(e),
    isOrganizer: e?.is_organizer === true || e?.isOrganizer === true,
    attendeesCount: Number(e?.attendees_count ?? e?.attendeesCount ?? 0) || 0,
    calendarTitle: calendarFeedName(e),
  };
}

/**
 * FYI marker: an all-day entry that exists to tell you what day it is, not to
 * take time from you. Public/bank holidays (home OR foreign), PTO markers and
 * personal holiday blocks.
 *
 * Attendee count is deliberately NOT part of this test — a public holiday with
 * an attendee attached is still a public holiday.
 *
 * Delegates to the availability SSOT (`_shared/availability/availability-classifier.ts`)
 * rather than re-listing holiday keywords here.
 */
export function isFyiMarkerEvent(e: any): boolean {
  const ae = toAvailabilityEvent(e);
  if (!ae.isAllDay) return false;
  if (isFyiHolidayCalendar(ae)) return true;
  return isPtoOrHolidayTitle(ae.title) || isPersonalHolidayTitle(ae.title);
}

/**
 * Category-aware load filter. This is the SINGLE predicate that decides
 * whether an event contributes to the day's load.
 *
 * Excluded from load (but still present in the Brief / Next Up):
 *   - FYI markers — public/bank holidays from any country, PTO, personal
 *     holiday blocks. Never load, whatever the attendee count.
 *   - Category G — all travel and logistics (flights, transfers, hotel legs).
 *   - Category H all-day blocks — personal rhythm, stays, weigh days.
 *
 * A flight is real, but it is not a meeting; counting it inflates the load pill.
 */
export function isLoadBearingEvent(e: any): boolean {
  const title = String(e?.title ?? '');
  if (!title) return false;
  if (isFyiMarkerEvent(e)) return false;
  if (STAY_RX.test(title) && isAllDayEvent(e)) return false;
  const { categoryId } = enrichEvent(e);
  if (categoryId === 'G') return false;
  if (categoryId === 'H' && isAllDayEvent(e)) return false;
  return true;
}

/**
 * THE filtered list. Built once per request and passed to every consumer —
 * load verdict, meeting count, fragmentation, deterministic copy and the
 * LLM-facing counts — so none of them can re-derive a different answer.
 */
export function filterLoadBearing<T>(events: T[]): T[] {
  return events.filter((e) => {
    if (isNoiseTitle((e as any)?.title)) return false;
    if (!isLoadBearingEvent(e)) return false;
    return survivesAttendeeOrDurationFloor(e as any);
  });
}


/**
 * Collapse duplicate entries occupying the same slot. Two providers (or two
 * subscribed feeds) syncing the same commitment must count once.
 *
 * Key = identical start+end. Among a group we keep the row with the most
 * attendee information, then the longest title.
 */
export function collapseSameSlot<T extends Record<string, any>>(events: T[]): T[] {
  const groups = new Map<string, T>();
  for (const e of events) {
    const key = `${e.start_time ?? e.startTime ?? ''}|${e.end_time ?? e.endTime ?? ''}`;
    const existing = groups.get(key);
    if (!existing) { groups.set(key, e); continue; }
    const a = Number(e.attendees_count ?? e.attendeesCount ?? 0) || 0;
    const b = Number(existing.attendees_count ?? existing.attendeesCount ?? 0) || 0;
    if (a > b) { groups.set(key, e); continue; }
    if (a === b && String(e.title ?? '').length > String(existing.title ?? '').length) {
      groups.set(key, e);
    }
  }
  return [...groups.values()];
}

const EMPTY_DISCONNECTED: CalendarMetricsResult = {
  load: 'low', pressure: 'low',
  eventCount: 0, meetingCount: 0, remainingMeetings: 0,
  state: 'not_connected',
  highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [],
  fragmentationScore: 0, shortGapCount: 0, backToBackHours: 0,
  briefEvents: [], rawEvents: [],
  loadBearingEvents: [], fyiMarkerCount: 0, fyiMarkerTitles: [],
  availability: null,
};

const EMPTY_NO_EVENTS: CalendarMetricsResult = {
  ...EMPTY_DISCONNECTED,
  state: 'connected_no_events',
};


/**
 * Reads the user's active calendar connection + today's events and returns
 * the canonical load / pressure / high-stakes shape. Treats a connection
 * that hasn't synced in > 7 days as effectively disconnected so the
 * "Connect Calendar" pill reappears.
 */
export async function getServerCalendarMetrics(
  db: AnySupabase,
  userId: string,
  timezoneOffset: number = 0,
  dayOffset: number = 0,
  platform: 'ios' | 'web' | 'unknown' = 'web',
  userCountry: string | null = null,
): Promise<CalendarMetricsResult> {

  const now = new Date();
  const userNow = new Date(now.getTime() - timezoneOffset * 60000);
  const targetDay = new Date(userNow);
  targetDay.setUTCDate(targetDay.getUTCDate() + dayOffset);

  const userStartOfDay = new Date(Date.UTC(
    targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate(), 0, 0, 0, 0,
  ));
  const userEndOfDay = new Date(Date.UTC(
    targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate(), 23, 59, 59, 999,
  ));
  const startUTC = new Date(userStartOfDay.getTime() + timezoneOffset * 60000);
  const endUTC = new Date(userEndOfDay.getTime() + timezoneOffset * 60000);

  const { data: activeConnections, error: connError } = await db
    .from('calendar_connections')
    .select('provider, last_sync')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1);

  if (connError) {
    console.error('[db-queries] Calendar connection query error:', connError);
  }

  if (!activeConnections || activeConnections.length === 0) {
    return { ...EMPTY_DISCONNECTED };
  }

  const lastSyncRaw = (activeConnections[0] as any)?.last_sync as string | null | undefined;
  if (lastSyncRaw) {
    const lastSyncMs = new Date(lastSyncRaw).getTime();
    if (Number.isFinite(lastSyncMs) && (Date.now() - lastSyncMs) > 7 * 86400000) {
      console.log('[db-queries] Calendar connection stale (>7d), treating as not_connected', { lastSyncRaw });
      return { ...EMPTY_DISCONNECTED };
    }
  }

  const { data: events, error } = await db
    .from('primary_calendar_events')
    .select('start_time, end_time, is_organizer, attendees_count, is_recurring, title, event_metadata')
    .eq('user_id', userId)
    .gte('start_time', startUTC.toISOString())
    .lte('start_time', endUTC.toISOString());

  if (error) {
    console.error('[db-queries] Calendar events query error:', error);
  }

  const eventList = collapseSameSlot(
    mergeCalendarEvents((events || []) as any[], platform),
  );

  if (eventList.length === 0) {
    return { ...EMPTY_NO_EVENTS };
  }

  // ---- THE filtered list. Built ONCE, before anything is scored. ----------
  const meetingList = filterLoadBearing(eventList as any[]);

  // FYI markers (holidays, PTO) — never load, but they shape framing.
  const fyiMarkers = (eventList as any[]).filter(isFyiMarkerEvent);
  const fyiMarkerTitles = fyiMarkers.map((e: any) => String(e.title ?? ''));

  // FILTER-FIRST: the demand scorer only ever sees load-bearing events, so a
  // day made up of bank holidays can never read "heavy".
  const demand = computeCalendarDemand(meetingList as any);
  const metrics = { load: demand.load as CalendarLevel, pressure: demand.pressure as CalendarLevel };

  // Canonical availability verdict from the SSOT (drives holiday framing).
  let availability: AvailabilityResult | null = null;
  try {
    availability = classifyAvailability({
      now: targetDay,
      events: (eventList as any[]).map(toAvailabilityEvent),
      userHomeCountry: userCountry ?? null,
      calendarLoad: metrics.load,
    });
  } catch (e) {
    console.error('[db-queries] availability classify failed:', e);
  }


  // High-stakes (future only, ranked by canonical stakesScore) — also from the
  // filtered list, so a holiday marker can never be surfaced as high-stakes.
  const futureEvents = (meetingList as any[]).filter((e: any) => new Date(e.start_time) > now);
  const futureRanked = rankByStakes(futureEvents as any, 5);
  const highStakesEvents: string[] = futureRanked
    .filter((s) => s.stakes >= 60 && s.event.title)
    .map((s) => s.event.title as string)
    .slice(0, 2);

  const remainingEvents = futureEvents.length;
  const remainingHighStakes: string[] = highStakesEvents.slice(0, 2);

  const meetingCount = countLoadUnits(meetingList.map((e: any) => ({
    id: e.id ?? e.external_id ?? e.title,
    title: e.title,
    startTime: e.start_time,
    endTime: e.end_time,
  }))).loadUnits;
  const remainingMeetingList = meetingList.filter(
    (e: any) => new Date(e.start_time) > new Date(now.getTime()),
  );
  const remainingMeetings = countLoadUnits(remainingMeetingList.map((e: any) => ({
    id: e.id ?? e.external_id ?? e.title,
    title: e.title,
    startTime: e.start_time,
    endTime: e.end_time,
  }))).loadUnits;

  const filteredOut = (eventList as any[]).filter((e: any) => !meetingList.includes(e));
  if (filteredOut.length > 0) {
    console.log('[db-queries] Excluded from load:', filteredOut.map((e: any) => {
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      const why = isFyiMarkerEvent(e) ? 'fyi_marker' : 'not_load_bearing';
      return `"${e.title}" (${Math.round(dur)}min, ${e.attendees_count || 0} attendees, ${why})`;
    }));
  }
  console.log('[calendar-load]', {
    userCountry,
    rawCount: eventList.length,
    loadBearingCount: meetingList.length,
    fyiMarkerCount: fyiMarkers.length,
    fyiMarkerTitles,
    load: metrics.load,
    availability: availability?.state ?? null,
  });

  // Fragmentation computed on filtered meetings only.
  const frag = computeCognitiveFragmentation(meetingList as any);

  return {
    ...metrics,
    eventCount: eventList.length,
    meetingCount,
    remainingMeetings,
    state: 'active',
    highStakesEvents,
    remainingEvents,
    remainingHighStakes,
    fragmentationScore: frag.fragmentation_score,
    shortGapCount: frag.short_gap_count,
    backToBackHours: frag.back_to_back_hours,
    briefEvents: toBriefEvents(eventList),
    rawEvents: eventList,
    loadBearingEvents: meetingList,
    fyiMarkerCount: fyiMarkers.length,
    fyiMarkerTitles,
    availability,

  };
}
