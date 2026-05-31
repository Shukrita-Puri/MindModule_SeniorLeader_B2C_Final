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
} from '../executive-state-taxonomy.ts';
import { computeCalendarDemand } from './demand-scorer.ts';
import { computeCognitiveFragmentation } from './cognitive-fragmentation.ts';
import type { CalendarLevel } from './context-builder.ts';

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
}

// Loose DB shape so this module doesn't pull the supabase-js client type.
type AnySupabase = {
  from: (table: string) => any;
};

const EMPTY_DISCONNECTED: CalendarMetricsResult = {
  load: 'low', pressure: 'low',
  eventCount: 0, meetingCount: 0, remainingMeetings: 0,
  state: 'not_connected',
  highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [],
  fragmentationScore: 0, shortGapCount: 0, backToBackHours: 0,
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

  const eventList = (events || []);

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
    return survivesAttendeeOrDurationFloor(e);
  };
  const meetingList = eventList.filter(isMeeting);
  const meetingCount = meetingList.length;
  const remainingMeetings = meetingList.filter(
    (e: any) => new Date(e.start_time) > new Date(now.getTime()),
  ).length;

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
  };
}