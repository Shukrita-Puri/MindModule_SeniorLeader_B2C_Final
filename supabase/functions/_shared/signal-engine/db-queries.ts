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

const PUBLIC_HOLIDAY_RX =
  /\b(public holiday|bank holiday|national holiday|statutory holiday|holiday observed|observed holiday)\b/i;

/** All-day accommodation legs the classifier doesn't tag as travel. */
const STAY_RX = /\b(hotel|airbnb|check[- ]?in|check[- ]?out|stay at|accommodation)\b/i;

export function isAllDayEvent(e: any): boolean {
  if (e?.is_all_day === true || e?.isAllDay === true || e?.all_day === true) return true;
  const startMs = new Date(e?.start_time ?? e?.startTime).getTime();
  const endMs = new Date(e?.end_time ?? e?.endTime ?? e?.start_time ?? e?.startTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return (endMs - startMs) / 60000 >= 23 * 60;
}

/**
 * Category-aware load filter for the user-facing meeting count.
 *
 * Excluded from the count (but still present in the Brief / Next Up):
 *   - Category G — all travel and logistics (flights, transfers, hotel legs).
 *   - Category H all-day blocks — personal rhythm, stays, weigh days.
 *   - Public holidays.
 *
 * A flight is real, but it is not a meeting; counting it inflates the load pill.
 */
export function isLoadBearingEvent(e: any): boolean {
  const title = String(e?.title ?? '');
  if (!title) return false;
  if (PUBLIC_HOLIDAY_RX.test(title)) return false;
  if (STAY_RX.test(title) && isAllDayEvent(e)) return false;
  const { categoryId } = enrichEvent(e);
  if (categoryId === 'G') return false;
  if (categoryId === 'H' && isAllDayEvent(e)) return false;
  return true;
}

const EMPTY_DISCONNECTED: CalendarMetricsResult = {
  load: 'low', pressure: 'low',
  eventCount: 0, meetingCount: 0, remainingMeetings: 0,
  state: 'not_connected',
  highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [],
  fragmentationScore: 0, shortGapCount: 0, backToBackHours: 0,
  briefEvents: [], rawEvents: [],
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

  const eventList = mergeCalendarEvents((events || []) as any[], platform);

  if (eventList.length === 0) {
    return { ...EMPTY_NO_EVENTS };
  }

  const demand = computeCalendarDemand(eventList as any);
  const metrics = { load: demand.load as CalendarLevel, pressure: demand.pressure as CalendarLevel };

  // High-stakes (future only, ranked by canonical stakesScore).
  const futureEvents = eventList.filter((e: any) => new Date(e.start_time) > now);
  const futureRanked = rankByStakes(futureEvents as any, 5);
  const highStakesEvents: string[] = futureRanked
    .filter((s) => s.stakes >= 60 && s.event.title)
    .map((s) => s.event.title as string)
    .slice(0, 2);

  const remainingEvents = futureEvents.length;
  const remainingHighStakes: string[] = highStakesEvents.slice(0, 2);

  // Filtered meeting count for user-facing text.
  const isMeeting = (e: any): boolean => {
    if (isNoiseTitle(e.title)) return false;
    if (!isLoadBearingEvent(e)) return false;
    return survivesAttendeeOrDurationFloor(e);
  };
  const meetingList = eventList.filter(isMeeting);
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

  const filteredOut = eventList.filter((e: any) => !isMeeting(e));
  if (filteredOut.length > 0) {
    console.log('[db-queries] Filtered non-meeting events:', filteredOut.map((e: any) => {
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      return `"${e.title}" (${Math.round(dur)}min, ${e.attendees_count || 0} attendees)`;
    }));
  }

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
  };
}
