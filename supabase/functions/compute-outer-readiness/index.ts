import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ==================== TYPES ====================
type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';
type CalendarLevel = 'low' | 'medium' | 'high';
type ThemeDriver = 'pressure+load' | 'pressure' | 'load' | 'morning' | 'evening' | 'state';

interface OuterReadinessResult {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: ThemeDriver;
  dataSources: string[];
  calendarState?: 'active' | 'connected_no_events' | 'not_connected';
  coachInsightAge?: number;
  coachInsightLabel?: string;
  // New: State statement + alreadyUsed[] relay for SharedContext
  stateStatement?: string;
  stateAlreadyUsed?: string[];
  compassAlreadyUsed?: string[];
}

interface ComputeRequest {
  innerReadinessTier: EnergyTier;
  innerReadinessScore: number;
  calendarLoad?: CalendarLevel | null;   // legacy client field, ignored if server can query
  calendarPressure?: CalendarLevel | null; // legacy client field, ignored if server can query
  archetype?: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  checkInOutcome: string | null;
  timezoneOffset?: number;
  componentScores?: { energyRegulation?: number; focusRecovery?: number; energyRenewal?: number } | null;
  practicePriorityTag?: string | null;
}

// ==================== SERVER-SIDE CALENDAR METRICS ====================
interface CalendarMetricsResult {
  load: CalendarLevel;
  pressure: CalendarLevel;
  eventCount: number;
  meetingCount: number;        // Filtered: excludes all-day blocks, personal blocks
  remainingMeetings: number;   // Filtered remaining meetings only
  state: 'active' | 'connected_no_events' | 'not_connected';
  highStakesEvents: string[];
  remainingEvents: number;
  remainingHighStakes: string[];
}

interface WearableContext {
  hrv: number | null;
  rhr: number | null;
  sleepScore: number | null;
  sleepDuration: number | null;
  hrElevated: boolean;  // Derived: HRV significantly below baseline implies sympathetic dominance (elevated HR)
  hrvElevated: boolean; // HRV significantly below baseline
  poorSleep: boolean;   // sleep_score < 60 or sleep_duration < 360 min (6h)
  rhrElevated: boolean; // RHR elevated vs personal baseline (deviation-based)
  dataSource: string | null; // e.g. 'apple-healthkit', 'oura', 'whoop'
}

function computeCalendarMetrics(events: Array<{ start_time: string; end_time: string; is_organizer: boolean; attendees_count: number; is_recurring: boolean }>): { load: CalendarLevel; pressure: CalendarLevel } {
  const now = new Date();
  const allEvents = events;
  const count = allEvents.length;

  // Sort events chronologically for gap analysis
  const sorted = [...allEvents].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Calculate gaps between consecutive events
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = (new Date(sorted[i + 1].start_time).getTime() - new Date(sorted[i].end_time).getTime()) / 60000;
    gaps.push(gap);
  }
  const avgGap = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : Infinity;
  const totalGapTime = gaps.length > 0 ? gaps.reduce((s, g) => s + Math.max(0, g), 0) : Infinity;

  // Load – density-aware thresholds
  let load: CalendarLevel = 'low';
  if (count >= 4) load = 'high';
  else if (count >= 3 && avgGap < 20) load = 'high';
  else if (count >= 3) load = 'medium';

  // Pressure – weighted scoring
  let totalPressure = 0;
  for (const event of allEvents) {
    let p = 0;
    if (event.is_organizer) p += 2;
    const att = event.attendees_count || 0;
    if (att > 5) p += 3; else if (att > 2) p += 1;
    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    const dur = (end.getTime() - start.getTime()) / 60000;
    if (dur > 60) p += 2; else if (dur >= 30) p += 1;
    if (!event.is_recurring) p += 1;
    const hr = start.getHours();
    if ((hr >= 9 && hr < 12) || (hr >= 14 && hr < 16)) p += 1;

    // Upcoming events carry full weight; past events carry half weight
    if (start >= now) {
      totalPressure += p;
    } else {
      totalPressure += Math.ceil(p * 0.5);
    }
  }

  // Stronger back-to-back detection
  for (const gap of gaps) {
    if (gap < 5) totalPressure += 3;
    else if (gap < 15) totalPressure += 2;
  }

  // Meeting density boost: total gap < 30 min across 3+ meetings
  if (count >= 3 && totalGapTime < 30) {
    totalPressure += 3;
  }

  // Intensity multiplier: >50% non-recurring AND organizer → 1.5x pressure
  const intenseMeetings = allEvents.filter(e => !e.is_recurring && e.is_organizer).length;
  if (count > 0 && intenseMeetings / count > 0.5) {
    totalPressure = Math.ceil(totalPressure * 1.5);
  }

  let pressure: CalendarLevel = 'low';
  if (totalPressure >= 6) pressure = 'high';
  else if (totalPressure >= 3) pressure = 'medium';

  return { load, pressure };
}

async function getServerCalendarMetrics(
  db: ReturnType<typeof createClient>,
  userId: string,
  timezoneOffset: number = 0,
  dayOffset: number = 0,
): Promise<CalendarMetricsResult> {
  const now = new Date();
  const userNow = new Date(now.getTime() - timezoneOffset * 60000);
  const targetDay = new Date(userNow);
  targetDay.setUTCDate(targetDay.getUTCDate() + dayOffset);

  const userStartOfDay = new Date(Date.UTC(
    targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate(), 0, 0, 0, 0
  ));
  const userEndOfDay = new Date(Date.UTC(
    targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate(), 23, 59, 59, 999
  ));
  const startUTC = new Date(userStartOfDay.getTime() + timezoneOffset * 60000);
  const endUTC = new Date(userEndOfDay.getTime() + timezoneOffset * 60000);

  const { data: conn } = await db
    .from('calendar_connections')
    .select('is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) {
    return { load: 'low', pressure: 'low', eventCount: 0, meetingCount: 0, remainingMeetings: 0, state: 'not_connected', highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [] };
  }

  const { data: events, error } = await db
    .from('calendar_events')
    .select('start_time, end_time, is_organizer, attendees_count, is_recurring, title')
    .eq('user_id', userId)
    .gte('start_time', startUTC.toISOString())
    .lte('start_time', endUTC.toISOString());

  if (error) {
    console.error('[compute-outer-readiness] Calendar events query error:', error);
  }

  const eventList = (events || []);

  if (eventList.length > 0) {
    const metrics = computeCalendarMetrics(eventList);

    // Identify high-stakes events by title
    // RELEVANCE RULE: Personal blocks (Day Block, Focus Time, Prep, Hold, etc.) are NOT high-stakes.
    // All-day events (>4h with ≤1 attendee) are NOT high-stakes – they're calendar blockers.
    // High-stakes = real meetings/presentations with multiple attendees or significant duration,
    // NOT personal calendar blocks used for preparation or focus.
    const personalBlockPatterns = /\b(day\s*block|focus\s*time|block\s*time|prep\s*block|prep\b|hold|blocked|do\s*not\s*book|dnb|no\s*meetings|lunch|break|commute|travel\s*time|personal|buffer)\b/i;
    const highStakesEvents: string[] = [];
    for (const e of eventList) {
      const att = e.attendees_count || 0;
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const dur = (end.getTime() - start.getTime()) / 60000;

      // Skip personal blocks: title matches a block/prep pattern (regardless of attendees)
      if (e.title && personalBlockPatterns.test(e.title)) continue;

      // Skip all-day or very long events (>4h) with few attendees – calendar blockers, not meetings
      if (dur > 240 && att <= 1) continue;

      const isHighStakes = !e.is_recurring && (att > 5 || (e.is_organizer && att > 2) || dur > 60);
      if (isHighStakes && e.title) {
        highStakesEvents.push(e.title);
      }
      if (highStakesEvents.length >= 2) break;
    }

    // Compute remaining events (events that haven't started yet relative to user's local time)
    const remainingEventsList = eventList.filter((e: any) => new Date(e.start_time) > new Date(now.getTime()));
    const remainingEvents = remainingEventsList.length;

    // Remaining high-stakes events
    const remainingHighStakes: string[] = [];
    for (const e of remainingEventsList) {
      const att = e.attendees_count || 0;
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const dur = (end.getTime() - start.getTime()) / 60000;
      if (e.title && personalBlockPatterns.test(e.title)) continue;
      if (dur > 240 && att <= 1) continue;
      const isHS = !e.is_recurring && (att > 5 || (e.is_organizer && att > 2) || dur > 60);
      if (isHS && e.title) remainingHighStakes.push(e.title);
      if (remainingHighStakes.length >= 2) break;
    }

    // ── Filtered meeting count: excludes all-day blocks and personal blocks ──
    // Used for user-facing text ("You've navigated X meetings") – raw eventCount stays for load/pressure scoring
    const isMeeting = (e: any): boolean => {
      const att = e.attendees_count || 0;
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const dur = (end.getTime() - start.getTime()) / 60000;
      if (e.title && personalBlockPatterns.test(e.title)) return false;
      if (dur > 240 && att <= 1) return false;
      return true;
    };
    const meetingList = eventList.filter(isMeeting);
    const meetingCount = meetingList.length;
    const remainingMeetings = meetingList.filter((e: any) => new Date(e.start_time) > new Date(now.getTime())).length;

    // Debug: log filtered-out events
    const filteredOut = eventList.filter((e: any) => !isMeeting(e));
    if (filteredOut.length > 0) {
      console.log('[compute-outer-readiness] Filtered non-meeting events:', filteredOut.map((e: any) => {
        const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
        return `"${e.title}" (${Math.round(dur)}min, ${e.attendees_count || 0} attendees)`;
      }));
    }

    return { ...metrics, eventCount: eventList.length, meetingCount, remainingMeetings, state: 'active', highStakesEvents, remainingEvents, remainingHighStakes };
  }

  return { load: 'low', pressure: 'low', eventCount: 0, meetingCount: 0, remainingMeetings: 0, state: 'connected_no_events', highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [] };
}

// ==================== TIME HELPERS ====================
function getUserTime(timezoneOffset: number): Date {
  const now = new Date();
  return new Date(now.getTime() - timezoneOffset * 60000);
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function isLateEvening(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

type DayContext = 'weekday' | 'friday' | 'saturday' | 'sunday';
function getDayContext(dayOfWeek: number): DayContext {
  if (dayOfWeek === 5) return 'friday';
  if (dayOfWeek === 6) return 'saturday';
  if (dayOfWeek === 0) return 'sunday';
  return 'weekday';
}

function hasMeaningfulDemand(
  load: CalendarLevel | null,
  pressure: CalendarLevel | null,
  highStakes?: string[],
  meetingCount?: number,
): boolean {
  return Boolean(highStakes?.length) || load === 'high' || pressure === 'high' || (meetingCount ?? 0) >= 3;
}

// ==================== CONTEXT SUFFIX BUILDER ====================
// Generates 1–2 sentence dynamic suffix connecting body signals to calendar demands.
// RELEVANCE RULE: Never list event titles as standalone items.
// Reference event names ONLY when paired with a strain signal or to characterize the day.
// For many events, use count. For high-stakes, reference by name only when it contextualizes.
function buildContextSuffix(
  todayHighStakes: string[] | undefined,
  eventCount: number | undefined,
  wearable: WearableContext | null | undefined,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
): string {
  const hasStakes = todayHighStakes && todayHighStakes.length > 0;
  const denseCalendar = eventCount && eventCount >= 4;
  const bodyStrained = wearable && (wearable.hrElevated || wearable.hrvElevated || wearable.rhrElevated);
  const hasSleepIssue = wearable?.poorSleep;
  const isEvening = timeOfDay === 'evening';

  // ── EVENING: Retrospective framing – acknowledge what was carried, not what to pace ──
  if (isEvening) {
    if (hasStakes && bodyStrained) {
     const stakeRef = todayHighStakes!.length === 1 ? `'${todayHighStakes![0]}'` : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
      return ` You carried ${stakeRef} today while your body ran at elevated strain throughout.`;
    }
    if (hasStakes && denseCalendar) {
      const stakeRef = `'${todayHighStakes![0]}'`;
      return ` You navigated ${stakeRef} and a full calendar today.`;
    }
    if (denseCalendar && bodyStrained) {
      return ` ${eventCount} meetings today, and your heart rate reflected the density throughout.`;
    }
    if (denseCalendar) {
      return ` You navigated a dense calendar today – ${eventCount} meetings.`;
    }
    if (bodyStrained) {
      return ' Your body is carrying accumulated strain – the day is done and recovery matters now.';
    }
    if (hasSleepIssue) {
      return ' You started today under-recovered and carried that through a full day.';
    }
    return '';
  }

  // ── MORNING / AFTERNOON: Forward-looking framing ──

  // When high-stakes events AND body strain – connect the two signals
  if (hasStakes && bodyStrained) {
    const stakeRef = todayHighStakes!.length === 1 ? `'${todayHighStakes![0]}'` : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
    return ` A day anchored by ${stakeRef} while your body carried elevated strain throughout.`;
  }

  // High-stakes events AND poor sleep (morning) – connect recovery to demands
  if (hasStakes && timeOfDay === 'morning' && hasSleepIssue) {
    const stakeRef = todayHighStakes!.length === 1 ? `'${todayHighStakes![0]}'` : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
    const sleepDetail = wearable!.sleepScore ? `(sleep score: ${wearable!.sleepScore})` : '';
    return ` Recovery overnight was incomplete ${sleepDetail} – and ${stakeRef} is ahead.`;
  }

  // High-stakes events, load is also high, body is fine – characterize the day
  if (hasStakes && denseCalendar) {
    const stakeRef = `'${todayHighStakes![0]}'`;
    return ` Your most demanding conditions today, anchored by ${stakeRef}.`;
  }

  // Dense calendar + body strain – connect density to physical signal
  if (denseCalendar && bodyStrained) {
    return ` ${eventCount} meetings with tight gaps, and your heart rate reflected the density.`;
  }

  // Dense calendar, no strain – note the volume (morning/afternoon only)
  if (denseCalendar) {
    return ` ${eventCount} meetings today – pace the gaps.`;
  }

  // Body strain only, light calendar – accumulated strain signal
  if (bodyStrained && (!eventCount || eventCount < 3)) {
    return ' Your body is carrying more than your calendar suggests – accumulated strain from recent days.';
  }

  // Morning poor sleep without high-stakes (standalone sleep note)
  if (timeOfDay === 'morning' && hasSleepIssue) {
    const detail = wearable!.sleepScore
      ? `sleep score: ${wearable!.sleepScore}`
      : wearable!.sleepDuration
      ? `${Math.round(wearable!.sleepDuration / 60)} hours of sleep`
      : 'incomplete recovery';
    return ` Your recovery overnight was incomplete (${detail}).`;
  }

  // Morning RHR elevated (without other flags already caught)
  if (timeOfDay === 'morning' && wearable?.rhrElevated && !bodyStrained) {
    return ' Your resting heart rate is running above baseline – your system didn\'t fully reset overnight.';
  }

  // Good recovery state (only if explicitly positive)
  if (wearable && wearable.sleepScore && wearable.sleepScore >= 75 && !wearable.hrElevated && !wearable.hrvElevated && !wearable.rhrElevated) {
    return ' Your body is well-recovered and ready for what\'s ahead.';
  }

  return '';
}

// ==================== AFTERNOON CONTEXT BUILDER ====================
// Adds afternoon-specific awareness: accumulated strain + remaining demands.
// RELEVANCE RULE: No standalone event name references. Weave if paired with strain.
function buildAfternoonContext(
  todayHighStakes: string[] | undefined,
  eventCount: number | undefined,
  wearable: WearableContext | null | undefined,
  baseContext: string,
): string {
  const parts: string[] = [];
  const bodyStrained = wearable && (wearable.hrElevated || wearable.hrvElevated);

  if (bodyStrained) {
    parts.push("Your heart rate has been elevated through a dense morning. The afternoon needs a leader who paces, not pushes.");
  } else if (wearable?.hrvElevated) {
    parts.push("Your HRV is showing accumulated strain from the morning.");
  }

  // Only reference high-stakes if paired with strain or as "most critical meeting"
  if (todayHighStakes && todayHighStakes.length > 0 && bodyStrained) {
    parts.push("With your most critical meeting still ahead, the pace of the next few hours matters.");
  } else if (eventCount && eventCount >= 4 && !bodyStrained) {
    parts.push(`${eventCount} meetings today – pace the remaining hours deliberately.`);
  }

  if (parts.length === 0) return baseContext;
  return baseContext + ' ' + parts.join(' ');
}

// ==================== WEEKDAY EVENING THEME BUILDER ====================
// Evening themes: acknowledge today first (validation), then frame tomorrow as recovery motivation.
// Banned: "plan", "prepare", "get ready". Use: "restore", "arrive", "release".
// REMAINING-EVENTS AWARENESS: Split into "day still going" vs "day is done" based on remainingEvents.
function buildWeekdayEveningTheme(
  tier: EnergyTier,
  tomorrowHighStakes?: string[],
  wearable?: WearableContext | null,
  defaultPhrase?: string,
  defaultContext?: string,
  todayHighStakes?: string[],
  eventCount?: number,
  calendarLoad?: CalendarLevel | null,
  calendarPressure?: CalendarLevel | null,
  remainingEvents?: number,
  remainingHighStakes?: string[],
  meetingCount?: number,
  remainingMeetings?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  const hasTomorrowStakes = tomorrowHighStakes && tomorrowHighStakes.length > 0;
  const tomorrowEvent = hasTomorrowStakes ? `'${tomorrowHighStakes[0]}'` : null;
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);
  const hadHeavyDay = calendarLoad === 'high' || calendarPressure === 'high';
  const hasTodayStakes = todayHighStakes && todayHighStakes.length > 0;
  const todayDense = eventCount && eventCount >= 4;

  // Use filtered meeting counts for user-facing text
  const filteredRemaining = remainingMeetings ?? remainingEvents ?? 0;
  const filteredTotal = meetingCount ?? eventCount ?? 0;
  const pastMeetings = filteredTotal - filteredRemaining;
  const hasRemainingHS = remainingHighStakes && remainingHighStakes.length > 0;

  // Sleep acknowledgment for evening
  const sleepNote = wearable?.poorSleep
    ? ' You started today under-recovered and carried that through a full day. Tonight\'s sleep matters more than usual.'
    : '';

  // RHR note for evening
  const rhrNote = wearable?.rhrElevated && !bodyStressed
    ? ' Your resting heart rate is still elevated – tonight\'s recovery is especially important.'
    : '';

  // ══════════════════════════════════════════════════════════════
  // BRANCH A: Meetings still ahead (remainingMeetings > 0)
  // Acknowledge past + frame remaining + connect to directive
  // ══════════════════════════════════════════════════════════════
  if (filteredRemaining > 0) {
    const pastLabel = pastMeetings > 0 ? `${pastMeetings} meeting${pastMeetings !== 1 ? 's' : ''}` : null;

    // A-1: Remaining high-stakes events ahead
    if (hasRemainingHS) {
      if (tier === 'depleted') {
        return {
          phrase: "Protect what's left.",
          context: `${pastLabel ? `You've spent most of today's reserves across ${pastLabel}. ` : ''}With '${remainingHighStakes![0]}' still ahead and your reserves low, protecting what's left means deploying only where it genuinely matters – everything before it is cost, not investment.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      if (tier === 'managing') {
        return {
          phrase: "Stay present for what's left.",
          context: `${pastLabel ? `You've navigated ${pastLabel} today. ` : ''}With '${remainingHighStakes![0]}' still ahead, your decision readiness is still operational – staying present for what remains is the highest-value move right now.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      if (tier === 'strong') {
        return {
          phrase: "Carry your edge forward.",
          context: `${pastLabel ? `You've navigated ${pastLabel} today with above-baseline readiness. ` : ''}'${remainingHighStakes![0]}' is still ahead – carry that edge forward into the moment that matters most rather than coasting on what's already done.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      // peak
      return {
        phrase: "Finish at your best.",
        context: `${pastLabel ? `${pastLabel} navigated at peak readiness. ` : ''}'${remainingHighStakes![0]}' is still ahead – this state is rare, finish at your best where it counts.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }

    // A-2: Remaining meetings but not high-stakes + body strain
    if (bodyStressed) {
      return {
        phrase: "Pace the remaining hours.",
        context: `${pastLabel ? `You've carried strain through ${pastLabel} already. ` : 'Your body is carrying accumulated strain. '}With ${filteredRemaining} still ahead, pacing the remaining hours protects the quality of your presence for what's left.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }

    // A-3: Remaining meetings, no strain, no high-stakes
    const phrase = defaultPhrase || "Close with care.";
    return {
      phrase,
      context: `${pastLabel ? `You've navigated ${pastLabel} so far. ` : ''}${filteredRemaining} still ahead – closing with care means bringing the same quality of attention to what remains without borrowing from tomorrow.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ══════════════════════════════════════════════════════════════
  // BRANCH B: Day is done (remainingMeetings === 0)
  // Full retrospective + tomorrow as recovery motivation
  // Context connects to the phrase directive
  // ══════════════════════════════════════════════════════════════

  // ── Build todaySummary: acknowledge what the user carried today ──
  const meetingLabel = filteredTotal > 0 ? `${filteredTotal} meeting${filteredTotal !== 1 ? 's' : ''}` : null;
  let todaySummary = '';
  if (hadHeavyDay && bodyStressed && hasTodayStakes) {
    todaySummary = `You carried a demanding day – ${todayHighStakes!.length >= 2 ? `${todayHighStakes!.length} high-stakes meetings` : `'${todayHighStakes![0]}'`} with your heart rate elevated throughout.`;
  } else if (hadHeavyDay && hasTodayStakes) {
    todaySummary = `You navigated '${todayHighStakes![0]}' and a full calendar today.`;
  } else if (hadHeavyDay && meetingLabel) {
    todaySummary = `You navigated a dense calendar – ${meetingLabel} with tight gaps.`;
  } else if (bodyStressed) {
    todaySummary = wearable!.hrElevated
      ? "Your heart rate ran high through today's demands."
      : "Your HRV is showing accumulated strain from today.";
  } else if (hadHeavyDay) {
    todaySummary = 'You carried a full day of demands.';
  } else if (meetingLabel) {
    todaySummary = `You navigated ${meetingLabel} today.`;
  }

  // ── Priority 1: Today was heavy + Tomorrow has high-stakes ──
  if (todaySummary && hasTomorrowStakes) {
    if (tier === 'depleted' || tier === 'managing') {
      return {
        phrase: "Ground before tomorrow.",
        context: `${todaySummary} Tomorrow has ${tomorrowEvent}. Grounding now means what you release tonight determines how sharp you arrive – restoration, not preparation.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    return {
      phrase: "Restore for what matters.",
      context: `${todaySummary} ${tomorrowEvent} is tomorrow. Restoring tonight is the highest-leverage move – you'll arrive sharper rested than over-rehearsed.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 2: Today was heavy, no tomorrow stakes ──
  if (todaySummary && bodyStressed) {
    return {
      phrase: defaultPhrase || "Let the body close.",
      context: `${todaySummary} Letting the body close means the cool-down tonight is physical, not just mental – what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 3: Light today + heavy tomorrow ──
  if (!hadHeavyDay && hasTomorrowStakes) {
    if (tier === 'depleted') {
      return {
        phrase: "Ground before tomorrow.",
        context: `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. Grounding tonight is genuine – your reserves are low and tomorrow will ask for them.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    return {
      phrase: "Arrive at your best.",
      context: `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. Arriving at your best means restoration now determines how you show up – not preparation.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 4: Tomorrow has high-stakes (body fine, today unremarkable) ──
  if (hasTomorrowStakes) {
    if (tier === 'depleted') {
      return {
        phrase: "Ground before tomorrow.",
        context: `You have ${tomorrowEvent} tomorrow and your reserves are low. Grounding tonight means arriving restored, not prepared – what you protect now directly shapes how you show up.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Close with tomorrow in mind.",
        context: `${tomorrowEvent} is tomorrow. Closing with tomorrow in mind means a clean finish tonight – you'll show up sharper by resting well than by rehearsing late.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Protect your edge for tomorrow.",
        context: `You have ${tomorrowEvent} tomorrow and above-baseline readiness to carry into it. Protecting your edge means a deliberate wind-down tonight, not preparation.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    // peak
    return {
      phrase: "Arrive at your best.",
      context: `${tomorrowEvent} is tomorrow and your readiness is at its peak. Arriving at your best means your only priority tonight is protecting this state through genuine rest.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 5: Body stressed, no stakes ──
  if (bodyStressed) {
    const bodySignal = wearable!.hrElevated
      ? "Your heart rate ran high through today's demands"
      : "Your HRV is showing accumulated strain from today";
    return {
      phrase: defaultPhrase || "Let the body close.",
      context: `${bodySignal}. Letting the body close means the cool-down is physical, not just mental – what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 6: Today acknowledgment without strain – TIER-AWARE directives ──
  if (todaySummary) {
    const phrase = defaultPhrase || "Close before tomorrow.";
    let directive: string;
    if (tier === 'depleted') {
      directive = 'tonight is about release and protection – your system needs genuine recovery before tomorrow\'s first decisions.';
    } else if (tier === 'managing') {
      directive = 'tonight is about a clean close – releasing the day\'s residue so you arrive steady tomorrow.';
    } else if (tier === 'strong') {
      directive = 'tonight is about consolidation – protecting the edge you carried today so it\'s available tomorrow.';
    } else {
      // peak
      directive = 'tonight is about intentional wind-down – a gentle transition preserves what you built today.';
    }
    return {
      phrase,
      context: `${todaySummary} Closing before tomorrow means ${directive}${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // Default: soft close – tier-aware
  const phrase = defaultPhrase || "Close before tomorrow.";
  let defaultDirective: string;
  if (tier === 'depleted') {
    defaultDirective = 'Tonight is about genuine release – your system needs recovery before tomorrow asks for anything.';
  } else if (tier === 'managing') {
    defaultDirective = 'Tonight is about a clean close – releasing the day so you arrive steady tomorrow.';
  } else if (tier === 'strong') {
    defaultDirective = 'Tonight is about protecting your edge – a deliberate wind-down carries today\'s advantage into tomorrow.';
  } else {
    defaultDirective = 'Tonight is about intentional transition – preserving what you built today through genuine rest.';
  }
  let ctx = `${defaultContext || defaultDirective} Closing before tomorrow protects the quality of how you arrive.`;
  if (sleepNote) ctx += sleepNote;
  if (rhrNote) ctx += rhrNote;
  return { phrase, context: ctx, driver: 'evening' };
}

// ==================== MORNING THEME BUILDER (sleep/recovery + calendar-aware) ====================
function buildMorningTheme(
  tier: EnergyTier,
  wearable?: WearableContext | null,
  defaultPhrase?: string,
  defaultContext?: string,
  todayHighStakes?: string[],
  eventCount?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  const hasHighStakes = todayHighStakes && todayHighStakes.length > 0;
  const eventRef = hasHighStakes
    ? todayHighStakes!.length === 1 ? `'${todayHighStakes![0]}'` : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`
    : null;

  // RHR morning note (added to relevant contexts)
  const rhrMorningNote = wearable?.rhrElevated
    ? ' Your resting heart rate is running above baseline – your system didn\'t fully reset overnight.'
    : '';

  // Priority 1: Poor sleep + high-stakes events today
  if (wearable?.poorSleep && hasHighStakes) {
    const sleepDetail = wearable.sleepScore
      ? `(sleep score: ${wearable.sleepScore})`
      : wearable.sleepDuration
      ? `(${Math.round(wearable.sleepDuration / 60)} hours)`
      : '';
    if (tier === 'depleted') {
      return {
        phrase: "Pace from the start.",
        context: `Recovery overnight was incomplete ${sleepDetail}, and you have ${eventRef} today. Your system is starting in deficit – pace the opening and deploy carefully where it counts.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Start steady, not strong.",
        context: `Recovery overnight was incomplete ${sleepDetail}, and ${eventRef} is ahead. Your operating baseline is lower than usual – a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Guard the morning window.",
        context: `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. With ${eventRef} ahead, that advantage is more fragile than usual – protect it through the morning's first demands.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context: `Peak readiness despite a shorter recovery window ${sleepDetail}. ${eventRef} is ahead – this state may not sustain through a full day. Deploy it where it matters most, not where it's spent first.${rhrMorningNote}`,
      driver: 'morning',
    };
  }

  // Priority 2: Good recovery + high-stakes events today
  if (hasHighStakes && wearable && !wearable.poorSleep && !wearable.hrvElevated) {
    if (tier === 'depleted') {
      return {
        phrase: "Pace from the start.",
        context: `${eventRef} is ahead today and your reserves are low despite adequate rest. Every early commitment costs more – protect your capacity for the moments that matter.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Set a sustainable pace.",
        context: `Adequate recovery and ${eventRef} ahead. Your operating baseline is solid enough – a steady opening protects the capacity you'll need later.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    // strong/peak
    return {
      phrase: tier === 'peak' ? "Protect the peak." : "Protect the window.",
      context: `Well-recovered and ${eventRef} is ahead. Your readiness is genuine – protect it through the morning's first demands.${rhrMorningNote}`,
      driver: 'morning',
    };
  }

  // Priority 3: Poor sleep only (no high-stakes events)
  if (wearable?.poorSleep) {
    const sleepDetail = wearable.sleepScore
      ? `(sleep score: ${wearable.sleepScore})`
      : wearable.sleepDuration
      ? `(${Math.round(wearable.sleepDuration / 60)} hours)`
      : '';
    // Add event count density note if available
    const densityNote = eventCount && eventCount >= 4
      ? ` ${eventCount} meetings today – pace through the volume deliberately.`
      : '';
    if (tier === 'depleted') {
      return {
        phrase: "Pace from the start.",
        context: `Recovery overnight was incomplete ${sleepDetail}. Your system is starting in deficit – every early commitment costs more today. Protect the first hours and deploy carefully.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Start steady, not strong.",
        context: `Recovery overnight was incomplete ${sleepDetail}. Your operating baseline is lower than usual – a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Guard the morning window.",
        context: `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. That advantage is more fragile than usual – protect it through the morning's first demands.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context: `Peak readiness despite a shorter recovery window ${sleepDetail}. This state may not sustain through a full day – deploy it where it matters most, not where it's spent first.${rhrMorningNote}${densityNote}`,
      driver: 'morning',
    };
  }

  // Priority 4: HRV elevated strain (no poor sleep)
  if (wearable?.hrvElevated) {
    const calendarNote = hasHighStakes
      ? ` ${eventRef} is ahead – pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead – pace through the volume.`
      : '';
    return {
      phrase: defaultPhrase || "Ease into the day.",
      context: `Your HRV is signalling accumulated strain from recent days. ${defaultContext || "How you pace the opening hours determines your capacity through the rest of the day."}${rhrMorningNote}${calendarNote}`,
      driver: 'morning',
    };
  }

  // Priority 4b: RHR elevated only (no other strain flags)
  if (wearable?.rhrElevated) {
    const calendarNote = hasHighStakes
      ? ` ${eventRef} is ahead – pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead – pace through the volume.`
      : '';
    return {
      phrase: defaultPhrase || "Ease into the day.",
      context: `Your resting heart rate is running above baseline – your system didn't fully reset overnight. ${defaultContext || "How you pace the opening hours determines your capacity through the rest of the day."}${calendarNote}`,
      driver: 'morning',
    };
  }

  // Priority 5: High-stakes events but no wearable data – tier-aware
  if (hasHighStakes) {
    let morningDirective: string;
    if (tier === 'depleted') {
      morningDirective = `'${eventRef}' is ahead today. Your reserves are low – protecting the opening hours determines how much you have when it matters.`;
    } else if (tier === 'managing') {
      morningDirective = `'${eventRef}' is ahead today. A steady opening protects the capacity you'll need for what matters later.`;
    } else if (tier === 'strong') {
      morningDirective = `'${eventRef}' is ahead today. Your readiness is genuine – protect it through the morning's first demands.`;
    } else {
      morningDirective = `'${eventRef}' is ahead today. Peak readiness is rare – deploy it where it matters most, not where it's spent first.`;
    }
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: morningDirective,
      driver: 'morning',
    };
  }

  // Priority 6: Dense calendar but no wearable / no stakes – tier-aware
  if (eventCount && eventCount >= 4) {
    let denseDirective: string;
    if (tier === 'depleted') {
      denseDirective = `${eventCount} meetings today. Your reserves are low – pace through the volume and protect the gaps between.`;
    } else if (tier === 'managing') {
      denseDirective = `${eventCount} meetings today. Sustainable pacing through the volume is the goal – protect the space between demands.`;
    } else if (tier === 'strong') {
      denseDirective = `${eventCount} meetings today. Your above-baseline readiness handles volume well – sustain the quality across the full day.`;
    } else {
      denseDirective = `${eventCount} meetings today. Peak readiness meets a full calendar – the conditions for effortless passage through complex demands.`;
    }
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: denseDirective,
      driver: 'morning',
    };
  }

  // Morning default fallback – tier-aware
  let morningDefault: string;
  if (tier === 'depleted') {
    morningDefault = defaultContext || "Your reserves are low. How you enter the day determines how much you have for what matters.";
  } else if (tier === 'managing') {
    morningDefault = defaultContext || "A steady opening protects the capacity you'll need through the full shape of the day.";
  } else if (tier === 'strong') {
    morningDefault = defaultContext || "Strong readiness at the start of the day. How you use the opening hours determines how much of this advantage you carry through.";
  } else {
    morningDefault = defaultContext || "Peak readiness at the start of the day. Every decision about how you use the opening hours is high-leverage.";
  }
  return { phrase: defaultPhrase || "Start with presence.", context: morningDefault, driver: 'morning' };
}


function getTheme(
  tier: EnergyTier,
  pressure: CalendarLevel | null,
  load: CalendarLevel | null,
  score: number,
  hour: number,
  dayOfWeek: number,
  tomorrowLoad?: CalendarLevel | null,
  tomorrowPressure?: CalendarLevel | null,
  tomorrowHighStakes?: string[],
  wearable?: WearableContext | null,
  todayHighStakes?: string[],
  eventCount?: number,
  remainingEvents?: number,
  remainingHighStakes?: string[],
  meetingCount?: number,
  remainingMeetings?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  
  if (pressure === null || load === null) {
    return getNoCalendarTheme(tier, score, hour, dayOfWeek, wearable, todayHighStakes, eventCount, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
  }

  const timeOfDay = getTimeOfDay(hour);
  const dayCtx = getDayContext(dayOfWeek);

  // Build dynamic context suffix for all tier×load×pressure entries
  const suffix = buildContextSuffix(todayHighStakes, eventCount, wearable, timeOfDay);
  const hasDemandAhead = hasMeaningfulDemand(load, pressure, todayHighStakes, meetingCount ?? eventCount);

  // DEPLETED TIER
  if (tier === 'depleted') {
    // Evening FIRST – always route to retrospective logic
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday') {
        const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
        const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead and your reserves are low. What you protect tonight directly determines how you show up for tomorrow's first high-stakes moment."
          : lightMon
          ? "A lighter Monday ahead, but ending the weekend depleted means the week still starts in deficit. Tonight's recovery matters."
          : "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.";
        return { phrase: "Close before the week.", context: ctx, driver: 'evening' };
      }
      if (dayCtx === 'friday')
        return { phrase: "Release the week.", context: "The week is done. A depleted system needs genuine release, not just the absence of work.", driver: 'evening' };
      return buildWeekdayEveningTheme('depleted', tomorrowHighStakes, wearable,
        "Close before tomorrow.", "What you don't release tonight you carry into tomorrow's first decisions and interactions.",
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    }
    // Morning
    if (timeOfDay === 'morning') {
      const depletedMorningCtx = hasDemandAhead
        ? "Starting the day in a depleted state with real demands ahead. How you enter each moment today matters more than how much you do."
        : "Starting the day in a depleted state. How you enter the day determines how much you have for what matters.";
      return buildMorningTheme('depleted', wearable, "Begin with intention.", depletedMorningCtx, todayHighStakes, eventCount);
    }
    // Afternoon
    if (timeOfDay === 'afternoon') {
      const base = hasDemandAhead
        ? "Carrying a depleted state through the afternoon with real demands still ahead. How you enter each remaining moment matters more than how much you do."
        : "Carrying a depleted state through the afternoon. How you spend what remains determines how you close the day.";
      return { phrase: "Pace the remaining hours.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Pressure×load matrix (morning/afternoon only now)
    if (pressure === 'high' && load === 'high')
      return { phrase: "One thing at a time.", context: "A heavy and high-stakes calendar is meeting a leader running below full capacity. What genuinely requires your full presence today, and what can be held or delegated?" + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Protect what matters.", context: "Significant stakes ahead with a manageable schedule. The space exists to be selective. Where you spend your capacity today determines the quality of your most important moments." + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Reserve for the moment.", context: "High stakes on a light schedule, a rare alignment. Your recovery window today is also your preparation window." + suffix, driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Navigate, don't absorb.", context: "A dense calendar without the high-stakes pressure of your hardest days. Steady passage through the volume is the goal, not deep engagement with each moment." + suffix, driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Move through gently.", context: "High volume without high stakes. The risk today is volume draining what little reserve you have. Move through rather than absorb." + suffix, driver: 'load' };
    if (load === 'medium')
      return { phrase: "Pace and protect.", context: "A moderate day that asks you to be present without overspending. Each recovery window between engagements is worth protecting." + suffix, driver: 'load' };
    if (load === 'low')
      return { phrase: "Rest is the work.", context: "A light calendar and a depleted system. Today's most productive act is genuine recovery." + suffix, driver: 'load' };
    return { phrase: "Protect your reserves.", context: "The day still needs to be met with what you have. Deliberate pacing is your strategy today." + suffix, driver: 'state' };
  }

  // MANAGING TIER
  if (tier === 'managing') {
    // Evening FIRST
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday') {
        const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
        const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead. How you close tonight is how you open the week – a clean transition here protects your capacity for tomorrow's first high-stakes moments."
          : lightMon
          ? "A lighter Monday ahead. A clean close tonight means you can open the week with intention rather than inertia."
          : "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.";
        return { phrase: "Close into the week.", context: ctx, driver: 'evening' };
      }
      if (dayCtx === 'friday')
        return { phrase: "Let the week go.", context: "You've carried the week at operating capacity. The weekend is a genuine recovery window if you let the work threads close.", driver: 'evening' };
      return buildWeekdayEveningTheme('managing', tomorrowHighStakes, wearable,
        "Close with care.", "You've carried the day's demands at operating capacity. How you close is how you recover.",
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    }
    // Morning
    if (timeOfDay === 'morning') {
      const managingMorningCtx = hasDemandAhead
        ? "The more meaningful parts of the day are still ahead. How you pace the opening determines whether you finish well."
        : "The day is relatively open. How you pace the opening sets the tone for what follows.";
      return buildMorningTheme('managing', wearable, "Set a sustainable pace.", managingMorningCtx, todayHighStakes, eventCount);
    }
    // Afternoon
    if (timeOfDay === 'afternoon') {
      const base = hasDemandAhead
        ? "The more meaningful parts of the day are still ahead. How you pace the remaining hours determines whether you finish well."
        : "The afternoon is relatively open. How you use this space determines how you close the day.";
      return { phrase: "Sustain the pace.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Pressure×load matrix
    if (pressure === 'high' && load === 'high')
      return { phrase: "Hold your ground.", context: "Your most demanding conditions are meeting an operational leader. Steadiness through the full weight of the day is both the challenge and the achievement." + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Steady into the stakes.", context: "High-stakes moments ahead with a manageable schedule. You have the capacity to show up well for what matters most today." + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Depth over breadth.", context: "Significant stakes on a clear schedule. Your operating capacity is well-matched to the important moments today if you protect the space around them." + suffix, driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Rhythm over intensity.", context: "A dense calendar at your current capacity calls for consistent pacing. Sustainable engagement through the full day rather than peaks and drops." + suffix, driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Ride the rhythm.", context: "High volume without high stakes. A day to move steadily through rather than push against." + suffix, driver: 'load' };
    if (load === 'medium')
      return { phrase: "Steady execution.", context: "Moderate demands meeting moderate capacity. A well-matched day for consistent, quality output." + suffix, driver: 'load' };
    if (load === 'low')
      return { phrase: "Build your reserves.", context: "Light demands on a managing state. A genuine opportunity to invest rather than spend today." + suffix, driver: 'load' };
    return { phrase: "Maintain your rhythm.", context: "Today calls for consistent, sustainable engagement. Protecting your operational state through the full shape of what the day holds." + suffix, driver: 'state' };
  }

  // STRONG TIER
  if (tier === 'strong') {
    // Evening FIRST
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday') {
        const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
        const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead, and your above-baseline readiness is a genuine advantage. Protecting this state tonight is the single highest-leverage move for tomorrow."
          : lightMon
          ? "A lighter Monday ahead and strong readiness to carry into it. Protecting tonight means the week opens from a position of genuine strength."
          : "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday rather than spending it before the week begins.";
        return { phrase: "Carry it into Monday.", context: ctx, driver: 'evening' };
      }
      if (dayCtx === 'friday')
        return { phrase: "Close the week strong.", context: "Above-baseline readiness at the end of the week. A strong close sets the foundation for genuine weekend recovery.", driver: 'evening' };
      return buildWeekdayEveningTheme('strong', tomorrowHighStakes, wearable,
        "Close strong.", "Above-baseline capacity at close of day. A strong finish is within reach and worth protecting.",
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    }
    // Morning
    if (timeOfDay === 'morning')
      return buildMorningTheme('strong', wearable, "Protect the window.", "Strong readiness at the start of the day. How you use the opening hours determines how much of this advantage you carry through.", todayHighStakes, eventCount);
    // Afternoon
    if (timeOfDay === 'afternoon') {
      const base = "Strong readiness through the afternoon. How you use the remaining hours determines how much of this advantage you carry into close.";
      return { phrase: "Sustain the advantage.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Pressure×load matrix
    if (pressure === 'high' && load === 'high')
      return { phrase: "Lead from strength.", context: "Your most demanding conditions are meeting a well-resourced leader. A day where your readiness is genuinely being asked for." + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Execute with presence.", context: "Significant stakes ahead with a focused schedule. You have both the capacity and the space to bring your best to the moments that count." + suffix, driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Bring your full weight.", context: "High stakes with room to prepare and recover. Conditions that allow your strongest leadership to show up fully." + suffix, driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Sustain the quality.", context: "A dense calendar with real stakes. Your above-baseline capacity is what keeps quality consistent across the full day." + suffix, driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Move with confidence.", context: "High volume meets strong capacity. A day you can move through with assurance rather than caution." + suffix, driver: 'load' };
    if (load === 'medium')
      return { phrase: "Invest the advantage.", context: "Above-baseline readiness on a selective day. The conditions are there to go deep on what matters rather than wide across everything." + suffix, driver: 'load' };
    if (load === 'low')
      return { phrase: "Protect and build.", context: "Strong readiness on a light day. Rare conditions for deep work, strategic thinking, or genuine recovery that compounds forward." + suffix, driver: 'load' };
    return { phrase: "Leverage your position.", context: "You are above baseline today. The question is where that advantage is most worth investing." + suffix, driver: 'state' };
  }

  // PEAK TIER – evening FIRST
  if (timeOfDay === 'evening') {
    if (dayCtx === 'sunday') {
      const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
      const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
      const ctx = heavyMon
        ? "Full readiness before a demanding Monday is exceptionally rare and valuable. Your only priority tonight is protecting this state through genuine rest."
        : lightMon
        ? "A lighter Monday ahead and peak readiness to carry into it. Protect this state – the week could open at your absolute best."
        : "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.";
      return { phrase: "Protect it for Monday.", context: ctx, driver: 'evening' };
    }
    if (dayCtx === 'friday')
      return { phrase: "Close at the peak.", context: "Peak readiness at week's end. A deliberate close tonight protects this state into the weekend.", driver: 'evening' };
    return buildWeekdayEveningTheme('peak', tomorrowHighStakes, wearable,
      "Close with intention.", "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.",
      todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
  }
  // Morning
  if (timeOfDay === 'morning')
    return buildMorningTheme('peak', wearable, "Protect the peak.", "Peak readiness at the start of the day. Every decision about how you use the opening hours is high-leverage.", todayHighStakes, eventCount);
  // Afternoon
  if (timeOfDay === 'afternoon') {
    const base = "Peak readiness through the afternoon. How you use the remaining hours determines how much of this advantage you carry into close.";
    return { phrase: "Channel the peak.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
  }
  // Pressure×load matrix
  if (pressure === 'high' && load === 'high')
    return { phrase: "Peak performance day.", context: "Your most demanding calendar is meeting your fullest readiness. A genuine high-leverage day where your leadership capacity is fully called upon." + suffix, driver: 'pressure+load' };
  if (pressure === 'high' && load === 'medium')
    return { phrase: "Full capacity, focused stakes.", context: "Significant moments ahead with room to be deliberate. Peak readiness plus space is the best possible condition for your most important leadership." + suffix, driver: 'pressure+load' };
  if (pressure === 'high' && load === 'low')
    return { phrase: "Peak meets opportunity.", context: "Your strongest readiness and the space to use it fully. A rare condition – deploy on what genuinely matters most to you." + suffix, driver: 'pressure' };
  if (pressure === 'medium' && load === 'high')
    return { phrase: "Flow through the day.", context: "A full calendar with your strongest capacity. Conditions for effortless passage through complex demands." + suffix, driver: 'load' };
  if (load === 'high' && pressure === 'low')
    return { phrase: "Effortless volume.", context: "High volume at peak readiness. The rare day where a full schedule doesn't need careful management." + suffix, driver: 'load' };
  if (load === 'medium')
    return { phrase: "Choose your investments.", context: "Full readiness on a selective day. The question is not what you can handle, but what deserves this state of readiness." + suffix, driver: 'load' };
  if (load === 'low')
    return { phrase: "Rare conditions.", context: "Peak readiness and an open schedule. The rarest combination – conditions for the thinking or decisions you've been waiting for." + suffix, driver: 'load' };
  return { phrase: "Own your optimal state.", context: "Full readiness is present. The priority is protecting that state through the full shape of what the day holds." + suffix, driver: 'state' };
}

// ==================== NO-CALENDAR FALLBACKS (sub-tier + time-aware) ====================
function getNoCalendarTheme(tier: EnergyTier, score: number, hour: number, dayOfWeek: number, wearable?: WearableContext | null, todayHighStakes?: string[], eventCount?: number, remainingEvents?: number, remainingHighStakes?: string[], meetingCount?: number, remainingMeetings?: number): { phrase: string; context: string; driver: ThemeDriver } {
  const dayCtx = getDayContext(dayOfWeek);
  const lateEvening = isLateEvening(hour);
  const timeOfDay = getTimeOfDay(hour);
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);

  // Build wearable-only suffix for no-calendar contexts
  const wearableSuffix = wearable
    ? (timeOfDay === 'morning' && wearable.poorSleep
      ? ` Your recovery overnight was incomplete${wearable.sleepScore ? ` (sleep score: ${wearable.sleepScore})` : ''}.${wearable.rhrElevated ? ' Your resting heart rate is running above baseline.' : ''}`
      : timeOfDay === 'morning' && wearable.rhrElevated
      ? ' Your resting heart rate is running above baseline – your system didn\'t fully reset overnight.'
      : wearable.hrElevated
      ? ' Your heart rate ran high recently – your body is carrying accumulated strain.'
      : wearable.hrvElevated
      ? ' Your HRV is signalling accumulated strain.'
      : wearable.sleepScore && wearable.sleepScore >= 75 && !wearable.hrElevated && !wearable.hrvElevated && !wearable.rhrElevated
      ? ' Your body is well-recovered and ready for what\'s ahead.'
      : '')
    : '';

  if (tier === 'depleted') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Rest before the week.", context: "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.", driver: 'state' };
      const bodyNote = bodyStressed ? ` Your ${wearable!.hrElevated ? 'heart rate ran high' : 'HRV shows strain'} through today – the cool-down is physical, not just mental.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered and carried that through a full day. Tonight\'s sleep matters more than usual.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated – tonight\'s recovery is especially important.' : '';
      return { phrase: "Let the day close.", context: `Your system has already given what it had. The most important thing now is genuine release and recovery.${bodyNote}${sleepNote}${rhrNote}`, driver: 'state' };
    }
    if (timeOfDay === 'morning')
      return buildMorningTheme('depleted', wearable, score <= 25 ? "Begin with stillness." : "Protect your reserves.",
        score <= 25
          ? "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual."
          : "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now.",
        todayHighStakes, eventCount);
    if (timeOfDay === 'afternoon') {
      const base = score <= 25
        ? "Leading from a deeply depleted state through the afternoon. Every remaining interaction carries a higher cost than usual."
        : "Below-baseline readiness shapes every remaining interaction. How much you spend on what's left is the decision that matters.";
      return { phrase: "Pace the remaining hours.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Non-late evening (18:00-20:59) – route to weekday evening theme
    if (timeOfDay === 'evening')
      return buildWeekdayEveningTheme('depleted', null, wearable,
        "Close before tomorrow.", "What you don't release tonight you carry into tomorrow's first decisions and interactions.",
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    if (score <= 25)
      return { phrase: "Begin with stillness.", context: "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual." + wearableSuffix, driver: 'state' };
    return { phrase: "Protect your reserves.", context: "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now." + wearableSuffix, driver: 'state' };
  }
  if (tier === 'managing') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Close into the week.", context: "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.", driver: 'state' };
      const bodyNote = bodyStressed ? ` Your body is also signalling strain – a deliberate physical wind-down tonight supports tomorrow's recovery.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered – tonight\'s sleep quality matters more than usual.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated – tonight\'s recovery is especially important.' : '';
      return { phrase: "Close the day cleanly.", context: `Operational capacity has served its purpose today. A clean close now protects tomorrow's opening state.${bodyNote}${sleepNote}${rhrNote}`, driver: 'state' };
    }
    if (timeOfDay === 'morning')
      return buildMorningTheme('managing', wearable, score <= 49 ? "Operate with care." : "Steady and selective.",
        score <= 49
          ? "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment."
          : "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes.",
        todayHighStakes, eventCount);
    if (timeOfDay === 'afternoon') {
      const base = score <= 49
        ? "Operational but not at full capacity. The afternoon calls for selective investment of your leadership presence rather than broad deployment."
        : "Baseline readiness is holding. You have capacity to show up well for what remains if you're deliberate about where it goes.";
      return { phrase: "Sustain the pace.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Non-late evening
    if (timeOfDay === 'evening')
      return buildWeekdayEveningTheme('managing', null, wearable,
        "Close with care.", "You've carried the day's demands at operating capacity. How you close is how you recover.",
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    if (score <= 49)
      return { phrase: "Operate with care.", context: "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment." + wearableSuffix, driver: 'state' };
    return { phrase: "Steady and selective.", context: "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes." + wearableSuffix, driver: 'state' };
  }
  if (tier === 'strong') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Carry it into Monday.", context: "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday.", driver: 'state' };
      const bodyNote = bodyStressed ? ` Despite above-baseline readiness, your ${wearable!.hrElevated ? 'heart rate' : 'HRV'} is signalling the body needs recovery – honour that tonight.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered – tonight\'s recovery window is especially valuable.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated – tonight\'s recovery is especially important.' : '';
      return { phrase: "Protect tomorrow's advantage.", context: `Above-baseline readiness at this hour is worth protecting through deliberate wind-down rather than spending.${bodyNote}${sleepNote}${rhrNote}`, driver: 'state' };
    }
    if (timeOfDay === 'morning')
      return buildMorningTheme('strong', wearable, score <= 69 ? "Lead with confidence." : "Invest your advantage.",
        score <= 69
          ? "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you."
          : "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing.",
        todayHighStakes, eventCount);
    if (timeOfDay === 'afternoon') {
      const base = score <= 69
        ? "Above-baseline readiness through the afternoon is a real asset. Your presence and judgment are working well for you."
        : "Strong readiness through the afternoon. The question is where that advantage is most worth directing in the remaining hours.";
      return { phrase: "Sustain the advantage.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
    }
    // Non-late evening
    if (timeOfDay === 'evening')
      return buildWeekdayEveningTheme('strong', null, wearable,
        "Close strong.", "Above-baseline capacity at close of day. A strong finish is within reach and worth protecting.",
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
    if (score <= 69)
      return { phrase: "Lead with confidence.", context: "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you." + wearableSuffix, driver: 'state' };
    return { phrase: "Invest your advantage.", context: "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing." + wearableSuffix, driver: 'state' };
  }
  // Peak
  if (lateEvening) {
    if (dayCtx === 'sunday')
      return { phrase: "Protect it for Monday.", context: "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.", driver: 'state' };
    const bodyNote = bodyStressed ? ` Your body is telling a different story to your mind – honour the physical signal with a genuine wind-down.` : '';
    const sleepNote = wearable?.poorSleep ? ' You started today under-recovered – tonight\'s recovery window is especially valuable.' : '';
    const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated – tonight\'s recovery is especially important.' : '';
    return { phrase: "Wind down deliberately.", context: `Peak activation at this hour needs a deliberate transition. Your nervous system needs the wind-down even when your mind doesn't.${bodyNote}${sleepNote}${rhrNote}`, driver: 'state' };
  }
  if (timeOfDay === 'morning')
    return buildMorningTheme('peak', wearable, score <= 89 ? "Bring your full presence." : "Own your peak.",
      score <= 89
        ? "Full readiness. Your capacity for complex decisions, difficult conversations, and high-stakes leadership is at its highest."
        : "Exceptional readiness is present. A rare state that is worth both using fully and protecting deliberately.",
      todayHighStakes, eventCount);
  if (timeOfDay === 'afternoon') {
    const base = score <= 89
      ? "Full readiness through the afternoon. Your capacity for complex decisions and high-stakes leadership is at its highest in the remaining hours."
      : "Exceptional readiness is present through the afternoon. A rare state that is worth both using fully and protecting deliberately.";
    return { phrase: "Channel the peak.", context: buildAfternoonContext(todayHighStakes, eventCount, wearable, base), driver: 'state' };
  }
  // Non-late evening
  if (timeOfDay === 'evening')
    return buildWeekdayEveningTheme('peak', null, wearable,
      "Close with intention.", "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.",
      todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes, meetingCount, remainingMeetings);
  if (score <= 89)
    return { phrase: "Bring your full presence.", context: "Full readiness. Your capacity for complex decisions, difficult conversations, and high-stakes leadership is at its highest." + wearableSuffix, driver: 'state' };
  return { phrase: "Own your peak.", context: "Exceptional readiness is present. A rare state that is worth both using fully and protecting deliberately." + wearableSuffix, driver: 'state' };
}

// ==================== LEAN ON / WATCH FOR ====================

// Calendar-aware evening Lean On / Watch For generator
// RELEVANCE RULE: Don't list event names. Acknowledge the day's weight and frame recovery.
function getEveningInsights(
  tier: EnergyTier,
  calendarLoad: CalendarLevel | null,
  calendarPressure: CalendarLevel | null,
  tomorrowLoad?: CalendarLevel | null,
  tomorrowPressure?: CalendarLevel | null,
  tomorrowHighStakes?: string[],
  wearable?: WearableContext | null,
): { leanOn: string; watchFor: string } {
  const hadHeavyDay = calendarLoad === 'high' || calendarPressure === 'high';
  const hasHighStakesTomorrow = tomorrowHighStakes && tomorrowHighStakes.length > 0;
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);

  // Build wearable-aware leanOn suffix – crisp, no numbers
  const bodyLeanOnSuffix = bodyStressed
    ? ' Your body carried today\'s load – the cool-down tonight is physical, not just mental.'
    : '';

  // Build tomorrow-aware watchFor suffix – crisp, no event names
  const tomorrowWatchSuffix = hasHighStakesTomorrow
    ? ' Pushing into preparation tonight when what you actually need is restoration. You\'ll arrive sharper rested than over-rehearsed.'
    : '';

  if (tier === 'depleted') {
    return {
      leanOn: (hadHeavyDay
        ? "Your awareness that a demanding day is done. Permission to stop is itself leadership tonight."
        : "Your awareness that your system has already given what it had. Permission to stop is itself a form of leadership.") + bodyLeanOnSuffix,
      watchFor: (hadHeavyDay
        ? "Replaying the day's demands instead of releasing them. The review can wait until morning."
        : "Replaying the day when what your system actually needs is release.") + tomorrowWatchSuffix,
    };
  }
  if (tier === 'managing') {
    return {
      leanOn: (hadHeavyDay
        ? "Your capacity to close a demanding day cleanly. You carried the weight – now let the day be done."
        : "Your capacity to close cleanly. The day is done and your system knows it.") + bodyLeanOnSuffix,
      watchFor: (hadHeavyDay
        ? "Carrying today's unfinished threads into recovery hours. A heavy day needs a clean close, not extended processing."
        : "Carrying unfinished mental threads into the hours your body needs to recover.") + tomorrowWatchSuffix,
    };
  }
  if (tier === 'strong') {
    return {
      leanOn: (hadHeavyDay
        ? "Your ability to transition deliberately after a full day. Strength used well today needs quality rest tonight."
        : "Your ability to transition. You can shift from performance mode to recovery mode deliberately.") + bodyLeanOnSuffix,
      watchFor: (hadHeavyDay
        ? "Staying in problem-solving mode after a day that already asked a lot. Tomorrow benefits more from rest than from tonight's residual thinking."
        : "Staying in problem-solving mode past the point where it serves tomorrow.") + tomorrowWatchSuffix,
    };
  }
  // peak
  return {
    leanOn: (hadHeavyDay
      ? "Your discipline to protect recovery after a high-output day. Peak performance sustained through a demanding schedule needs deliberate wind-down."
      : "Your discipline to protect recovery even when your system still feels activated. High output needs high-quality rest.") + bodyLeanOnSuffix,
    watchFor: (hadHeavyDay
      ? "Mistaking late-night activation for productive energy after a full day. Your nervous system needs the wind-down especially after sustained output."
      : "Mistaking late-night activation for productive energy. Your nervous system needs the wind-down even when your mind doesn't.") + tomorrowWatchSuffix,
  };
}

// Calendar-aware Sunday evening Lean On / Watch For generator
// RELEVANCE RULE: No event name listing. Acknowledge weekend and frame Monday recovery.
function getSundayEveningInsights(
  tier: EnergyTier,
  calendarLoad: CalendarLevel | null,
  calendarPressure: CalendarLevel | null,
  mondayLoad: CalendarLevel | null,
  mondayPressure: CalendarLevel | null,
  mondayHighStakes?: string[],
  wearable?: WearableContext | null,
): { leanOn: string; watchFor: string } {
  const heavyMonday = mondayLoad === 'high' || mondayPressure === 'high';
  const moderateMonday = mondayLoad === 'medium' || mondayPressure === 'medium';
  const hasMonStakes = mondayHighStakes && mondayHighStakes.length > 0;
  const monEvent = hasMonStakes ? mondayHighStakes[0] : null;
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);

  // Wearable suffix for Sunday leanOn – crisp
  const bodySuffix = bodyStressed
    ? ' Your body is also signalling strain from this weekend. Tonight\'s recovery is physical too.'
    : '';

  // High-stakes Monday event reference (kept for Sunday as forward-look is primary)
  const stakeRef = monEvent ? ` You have '${monEvent}' on Monday.` : '';

  if (tier === 'depleted') {
    return {
      leanOn: (heavyMonday
        ? `Your awareness that starting the week depleted before a demanding Monday is itself critical information.${stakeRef} What you protect tonight directly determines how you show up for tomorrow's first high-stakes moment.`
        : "Your awareness that starting the week already depleted is itself useful information. What you protect tonight is the most important leadership decision you make before Monday.") + bodySuffix,
      watchFor: heavyMonday
        ? `Pushing through Sunday evening when Monday demands your best. Deficit carried into a heavy day compounds every decision.`
        : "Pushing through Sunday evening when your system needs recovery. Deficit carried into Monday compounds through the week.",
    };
  }
  if (tier === 'managing') {
    return {
      leanOn: (heavyMonday
        ? `Your capacity to close the weekend cleanly.${stakeRef} A demanding Monday is ahead – how you enter it matters more than what you plan for it.`
        : "Your capacity to close the weekend cleanly and set a deliberate intention for how you want to enter the week.") + bodySuffix,
      watchFor: heavyMonday
        ? 'Pre-loading Monday\'s stress tonight. The preparation that matters most is protecting your internal state, not rehearsing tomorrow\'s calendar.'
        : moderateMonday
        ? "Drifting into Monday without a clear internal anchor. A moderate week ahead deserves a deliberate opening."
        : "Drifting into Monday without a clear internal anchor. Operational capacity without direction diffuses quickly.",
    };
  }
  if (tier === 'strong') {
    return {
      leanOn: (heavyMonday
        ? `Your above-baseline readiness meeting a demanding Monday.${stakeRef} Protecting this state tonight is the single highest-leverage move for tomorrow.`
        : "Your readiness to open the week from a position of genuine strength. Above-baseline on a Sunday evening is a real advantage if protected.") + bodySuffix,
      watchFor: heavyMonday
        ? 'Spending tonight\'s strong state on Monday prep instead of genuine wind-down. Your best asset for a heavy day is arriving rested, not over-prepared.'
        : "Spending tonight's advantage before the week even starts. Protecting this state is more valuable than any preparation.",
    };
  }
  // peak
  return {
    leanOn: (heavyMonday
      ? `Full readiness before a demanding Monday is exceptionally rare.${stakeRef} Your only priority tonight is protecting this state through genuine rest.`
      : "Full readiness on a Sunday evening is a rare advantage worth protecting deliberately. How you close tonight determines whether that state is still available tomorrow.") + bodySuffix,
    watchFor: heavyMonday
      ? 'Treating peak state as license to work into the evening. Your highest-leverage move tonight is rest, not output.'
      : "Treating peak state as license to work into the evening. Your nervous system needs the wind-down.",
  };
}

// Clarity × Confidence modifier – now time-aware for evening retrospective framing
function getCCModifier(
  clarity: number | null,
  confidence: number | null,
  timeOfDay?: 'morning' | 'afternoon' | 'evening',
): { leanOn: string; watchFor: string } | null {
  if (clarity === null && confidence === null) return null;

  const clarityLow = clarity !== null && clarity <= 2;
  const clarityHigh = clarity !== null && clarity >= 4;
  const confidenceLow = confidence !== null && confidence <= 2;
  const confidenceHigh = confidence !== null && confidence >= 4;
  const isEvening = timeOfDay === 'evening';

  // Pattern 1: Both low
  if (clarityLow && confidenceLow) {
    return isEvening
      ? { leanOn: "Your self-honesty", watchFor: "Forcing resolution tonight" }
      : { leanOn: "Your self-honesty", watchFor: "Premature commitments" };
  }

  // Pattern 2: Both high
  if (clarityHigh && confidenceHigh) {
    return isEvening
      ? { leanOn: "Your alignment", watchFor: "Over-optimising what worked" }
      : { leanOn: "Your alignment", watchFor: "Rigidity from conviction" };
  }

  // Pattern 3: High clarity + low confidence
  if (clarityHigh && confidenceLow) {
    return isEvening
      ? { leanOn: "Your clarity", watchFor: "Replaying doubt" }
      : { leanOn: "Your clarity", watchFor: "Delaying action" };
  }

  // Pattern 4: Low clarity + high confidence
  if (clarityLow && confidenceHigh) {
    return isEvening
      ? { leanOn: "Your confidence", watchFor: "Forcing clarity tonight" }
      : { leanOn: "Your confidence", watchFor: "Moving without direction" };
  }

  // Pattern 5: Low clarity only
  if (clarityLow) {
    return isEvening
      ? { leanOn: "Your discernment", watchFor: "Grinding open questions" }
      : { leanOn: "Your discernment", watchFor: "Acting without anchor" };
  }

  // Pattern 6: Low confidence only
  if (confidenceLow) {
    return isEvening
      ? { leanOn: "Your self-awareness", watchFor: "Reviewing through doubt" }
      : { leanOn: "Your self-awareness", watchFor: "Projected confidence" };
  }

  // Pattern 7: High clarity only
  if (clarityHigh) {
    return isEvening
      ? { leanOn: "Your direction", watchFor: "Replaying what held" }
      : { leanOn: "Your direction", watchFor: "Crowding out perspectives" };
  }

  // Pattern 8: High confidence only
  if (confidenceHigh) {
    return isEvening
      ? { leanOn: "Your conviction", watchFor: "Running past the close" }
      : { leanOn: "Your conviction", watchFor: "Closing off inputs" };
  }

  // Mid-range on both – no modifier, fall through to archetype/tier
  return null;
}

// Priority 3: Archetype × Tier matrix
const archetypeMatrix: Record<string, Record<EnergyTier, { leanOn: string; watchFor: string }>> = {
  'grounded-leader': {
    depleted: { leanOn: "Your stillness instinct", watchFor: "Absorbing others' energy" },
    managing: { leanOn: "Your rootedness", watchFor: "Quiet drain from steadying others" },
    strong: { leanOn: "Your natural stability", watchFor: "Maintenance mode" },
    peak: { leanOn: "Your grounded precision", watchFor: "Tunnel focus" },
  },
  'resilient-performer': {
    depleted: { leanOn: "Your recovery wisdom", watchFor: "Performing resilience" },
    managing: { leanOn: "Your baseline reliability", watchFor: "Settling for operational" },
    strong: { leanOn: "Your performance window", watchFor: "Burning it early" },
    peak: { leanOn: "Your competitive edge", watchFor: "Spending the peak too fast" },
  },
  'clear-thinker': {
    depleted: { leanOn: "Your economy of thought", watchFor: "Over-processing" },
    managing: { leanOn: "Your analytical clarity", watchFor: "Over-investing cognitively" },
    strong: { leanOn: "Your sharpest insights", watchFor: "Analysis past the insight" },
    peak: { leanOn: "Your analytical precision", watchFor: "Complexity for its own sake" },
  },
  'intensity-driver': {
    depleted: { leanOn: "Your rest-as-fuel wisdom", watchFor: "Forcing intensity on empty" },
    managing: { leanOn: "Your directed drive", watchFor: "Impatience with your pace" },
    strong: { leanOn: "Your sustainable intensity", watchFor: "Outpacing the day" },
    peak: { leanOn: "Your full-force capability", watchFor: "Opening at full intensity" },
  },
  'adaptive-navigator': {
    depleted: { leanOn: "Your situational awareness", watchFor: "Adapting to others' demands" },
    managing: { leanOn: "Your flexibility", watchFor: "Staying adaptive vs. holding firm" },
    strong: { leanOn: "Your strategic read", watchFor: "Over-navigating" },
    peak: { leanOn: "Your strategic agility", watchFor: "Complexity over decisiveness" },
  },
  // Legacy ID fallbacks
  'natural-regulator': {
    depleted: { leanOn: "Your stillness instinct", watchFor: "Absorbing others' energy" },
    managing: { leanOn: "Your rootedness", watchFor: "Quiet drain from steadying others" },
    strong: { leanOn: "Your natural stability", watchFor: "Maintenance mode" },
    peak: { leanOn: "Your grounded precision", watchFor: "Tunnel focus" },
  },
  'high-octane-performer': {
    depleted: { leanOn: "Your recovery wisdom", watchFor: "Performing resilience" },
    managing: { leanOn: "Your baseline reliability", watchFor: "Settling for operational" },
    strong: { leanOn: "Your performance window", watchFor: "Burning it early" },
    peak: { leanOn: "Your competitive edge", watchFor: "Spending the peak too fast" },
  },
  'strategic-pauser': {
    depleted: { leanOn: "Your economy of thought", watchFor: "Over-processing" },
    managing: { leanOn: "Your analytical clarity", watchFor: "Over-investing cognitively" },
    strong: { leanOn: "Your sharpest insights", watchFor: "Analysis past the insight" },
    peak: { leanOn: "Your analytical precision", watchFor: "Complexity for its own sake" },
  },
  'awareness-builder': {
    depleted: { leanOn: "Your rest-as-fuel wisdom", watchFor: "Forcing intensity on empty" },
    managing: { leanOn: "Your directed drive", watchFor: "Impatience with your pace" },
    strong: { leanOn: "Your sustainable intensity", watchFor: "Outpacing the day" },
    peak: { leanOn: "Your full-force capability", watchFor: "Opening at full intensity" },
  },
};

// Priority 5: Hardcoded tier fallbacks
const tierFallbacks: Record<EnergyTier, { leanOn: string; watchFor: string }> = {
  depleted: { leanOn: "Your state awareness", watchFor: "Over-committing" },
  managing: { leanOn: "Your operational steadiness", watchFor: "Over-extending" },
  strong: { leanOn: "Your above-baseline readiness", watchFor: "Diffusing capacity" },
  peak: { leanOn: "Your full readiness", watchFor: "Spending the peak unchecked" },
};

// ==================== COACH INSIGHT AGE TIERS ====================
type CoachInsightTier = 'recent' | 'grace' | 'contextual' | 'historical' | 'archived';

function getCoachInsightTier(daysOld: number): CoachInsightTier {
  if (daysOld <= 3) return 'recent';
  if (daysOld <= 7) return 'grace';
  if (daysOld <= 14) return 'contextual';
  if (daysOld <= 30) return 'historical';
  return 'archived';
}

function detectCCContradiction(
  coachStrength: string,
  coachGrowth: string,
  clarity: number | null,
  confidence: number | null,
): boolean {
  const combined = (coachStrength + ' ' + coachGrowth).toLowerCase();
  const mentionsClarity = combined.includes('clarity') || combined.includes('clear') || combined.includes('direction') || combined.includes('focus');
  const mentionsConfidence = combined.includes('confidence') || combined.includes('conviction') || combined.includes('certainty') || combined.includes('trust in');

  if (mentionsClarity && (clarity ?? 3) <= 2) return true;
  if (mentionsConfidence && (confidence ?? 3) <= 2) return true;
  return false;
}

// Feature flag for Phase 2 wearable recovery override
const ENABLE_WEARABLE_RECOVERY_TRIGGER = true;

// ==================== PHASE 2: WEARABLE RECOVERY TRIGGER (flagged OFF) ====================
async function checkWearableRecoveryTrigger(
  userId: string,
  db: ReturnType<typeof createClient>
): Promise<{ triggered: boolean; reason: string; hrvDeviation: number; consecutiveDays: number } | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentHRV } = await db
      .from('wearable_data')
      .select('summary_date, hrv')
      .eq('user_id', userId)
      .gte('summary_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('summary_date', { ascending: false })
      .limit(7);

    if (!recentHRV || recentHRV.length < 3) return null;

    const baseline = recentHRV.reduce((sum: number, d: any) => sum + (d.hrv || 0), 0) / recentHRV.length;
    if (baseline <= 0) return null;

    // Check consecutive days <-20% below baseline
    let consecutiveDays = 0;
    for (const sample of recentHRV) {
      const deviation = (((sample as any).hrv - baseline) / baseline) * 100;
      if (deviation < -20) consecutiveDays++;
      else break;
    }

    if (consecutiveDays >= 2) {
      const todayDeviation = Math.round((((recentHRV[0] as any).hrv - baseline) / baseline) * 100);
      return {
        triggered: true,
        reason: `Sustained HRV deficit detected (${consecutiveDays} consecutive days <-20% below baseline)`,
        hrvDeviation: todayDeviation,
        consecutiveDays,
      };
    }

    // Single-day extreme drop (<-30%)
    const todayDeviation = (((recentHRV[0] as any).hrv - baseline) / baseline) * 100;
    if (todayDeviation < -30) {
      return {
        triggered: true,
        reason: 'Severe single-day HRV drop detected (<-30% below baseline)',
        hrvDeviation: Math.round(todayDeviation),
        consecutiveDays: 1,
      };
    }

    return null;
  } catch (err) {
    console.error('[compute-outer-readiness] Wearable recovery trigger error:', err);
    return null;
  }
}

// ==================== LEAN ON / WATCH FOR – PRIORITY CASCADE ====================
// Data source priority for LeanOn/WatchFor:
// 1. Coach conversations (strength/growth insights) – PERSONAL
// 2. Archetype (onboarding-derived behavioral profile) – PERSONAL
// 3. [Future] LinkedIn profile analysis – PERSONAL
// 4. [Future] LLM conversation data (Claude/ChatGPT patterns) – PERSONAL
// 5. Calendar + Wearable context – SITUATIONAL (layered as suffix, never standalone)
// 6. Tier fallback – GENERIC
//
// Rule: Personal sources always lead. Situational context enriches but never replaces.
// Suffixes must be crisp – no event titles, no metric numbers.

interface LeanOnWatchForResult {
  leanOn: string;
  watchFor: string;
  source: string;
  coachInsightAge?: number;
  coachInsightLabel?: string;
  recoveryDayTriggered?: boolean;
}

// Build context enrichment suffix for leanOn – crisp, no event titles, no HR numbers.
// Subtly reinforces the personal insight with situational acknowledgment.
// Now aware of remaining events for evening.
function buildDaytimeLeanOnSuffix(
  todayHighStakes: string[] | undefined,
  wearable: WearableContext | null | undefined,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  remainingEvents?: number,
): string {
  const hasStakes = todayHighStakes && todayHighStakes.length > 0;
  const bodyStrained = wearable && (wearable.hrElevated || wearable.hrvElevated || wearable.poorSleep || wearable.rhrElevated);
  const denseDay = hasStakes || bodyStrained;

  if (!denseDay) return '';

  if (timeOfDay === 'morning') {
    if (bodyStrained && hasStakes) return ' A demanding day ahead is meeting that instinct – and your body is carrying strain into it.';
    if (bodyStrained) return ' Your body is carrying strain into today. That awareness is itself an advantage.';
    if (hasStakes) return ' Your readiness for today\'s demands is genuine.';
  }

  if (timeOfDay === 'afternoon') {
    if (bodyStrained) return ' The morning tested that capacity – the afternoon will too.';
    if (hasStakes) return ' The afternoon\'s demands are meeting that instinct.';
  }

  if (timeOfDay === 'evening') {
    const remaining = remainingEvents ?? 0;
    if (remaining > 0) {
      if (bodyStrained) return ' The day isn\'t done – that instinct still serves you, and your body is signalling to pace what\'s left.';
      return ' The day isn\'t done – that instinct still serves you.';
    }
    if (bodyStrained) return ' Today tested that capacity. Your body is signalling the day is done.';
    return ' Today tested that capacity. The day is done.';
  }

  return '';
}

// Build context enrichment suffix for watchFor – crisp, no event titles, no HR numbers.
// Now aware of remaining events for evening.
function buildDaytimeWatchForSuffix(
  todayHighStakes: string[] | undefined,
  wearable: WearableContext | null | undefined,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  remainingEvents?: number,
): string {
  const hasStakes = todayHighStakes && todayHighStakes.length > 0;
  const bodyStrained = wearable && (wearable.hrElevated || wearable.hrvElevated || wearable.rhrElevated);

  if (timeOfDay === 'morning') {
    if (bodyStrained && hasStakes) return ' Spending your advantage before the day\'s biggest moments.';
    if (wearable?.poorSleep) return ' Opening at full intensity when your recovery was incomplete.';
    if (bodyStrained) return ' Pushing through when your body is already signalling strain.';
  }

  if (timeOfDay === 'afternoon') {
    if (bodyStrained) return ' Pushing through when your body is already signalling the cost.';
  }

  if (timeOfDay === 'evening') {
    const remaining = remainingEvents ?? 0;
    if (remaining > 0 && bodyStrained) return ' Pushing through the remaining meetings when your body is already signalling the cost.';
    if (remaining > 0) return ' Mentally closing the day when demands still remain. Stay present for what\'s left.';
    if (bodyStrained) return ' Replaying the day\'s demands instead of releasing them. Your body is signalling the need to stop.';
    if (hasStakes) return ' Replaying the day\'s demands instead of releasing them.';
  }

  return '';
}

function getLeanOnWatchFor(
  tier: EnergyTier,
  archetype: string | null,
  clarity: number | null,
  confidence: number | null,
  coachStrength: string | null,
  coachGrowth: string | null,
  coachInsightCreatedAt: string | null,
  hour: number,
  dayOfWeek: number,
  calendarLoad: CalendarLevel | null,
  calendarPressure: CalendarLevel | null,
  tomorrowLoad: CalendarLevel | null,
  tomorrowPressure: CalendarLevel | null,
  tomorrowHighStakes: string[],
  wearableContext: WearableContext | null,
  wearableRecovery?: { triggered: boolean; reason: string; hrvDeviation: number; consecutiveDays: number } | null,
  todayHighStakes?: string[],
  eventCount?: number,
  remainingEvents?: number,
): LeanOnWatchForResult {
  const lateEvening = isLateEvening(hour);
  const dayCtx = getDayContext(dayOfWeek);
  const timeOfDay = getTimeOfDay(hour);

  // Compute coach insight age + tier
  let coachDaysOld = 0;
  let coachTier: CoachInsightTier = 'archived';
  const hasCoachBoth = !!(coachStrength && coachGrowth);

  if (coachInsightCreatedAt) {
    coachDaysOld = Math.floor((Date.now() - new Date(coachInsightCreatedAt).getTime()) / 86400000);
    coachTier = getCoachInsightTier(coachDaysOld);
  }

  // Determine if there's context worth enriching (now includes evening)
  const hasContextEnrichment = (
    (todayHighStakes && todayHighStakes.length > 0) ||
    (wearableContext && (wearableContext.hrElevated || wearableContext.hrvElevated || wearableContext.poorSleep || wearableContext.rhrElevated))
  );

  // ── P-1: Wearable sustained deficit (Phase 2, feature-flagged OFF) ──
  if (ENABLE_WEARABLE_RECOVERY_TRIGGER && wearableRecovery?.triggered) {
    return {
      leanOn: "Your awareness that your system needs restoration, not activation. What you protect today prevents what you'll regret tomorrow.",
      watchFor: "Trying to 'push through' when your physiology is already in deficit. Ignoring this signal compounds the cost.",
      source: 'wearable-recovery-override',
      recoveryDayTriggered: true,
    };
  }

  // ── P0a: Sunday evening (after 9pm on Sunday) – ALWAYS wins ──
  if (lateEvening && dayCtx === 'sunday') {
    return { ...getSundayEveningInsights(tier, calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext), source: 'sunday-evening-override' };
  }

  // ── P0b: Late evening weekdays/Saturday (after 9pm) – recovery ALWAYS takes priority ──
  if (lateEvening) {
    return { ...getEveningInsights(tier, calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext), source: 'evening-recovery-override' };
  }

  // ── P1a: Coach insights ≤3 days (recent) ──
  if (hasCoachBoth && coachTier === 'recent') {
    return {
      leanOn: `${coachStrength!} (coach)`,
      watchFor: `${coachGrowth!} (coach)`,
      source: 'coach-insights-recent',
      coachInsightAge: coachDaysOld,
    };
  }

  // ── P1b: Coach insights 4-7 days (grace) – use if no C×C contradiction ──
  if (hasCoachBoth && coachTier === 'grace') {
    const hasContradiction = detectCCContradiction(coachStrength!, coachGrowth!, clarity, confidence);
    if (!hasContradiction) {
      return {
        leanOn: `${coachStrength!} (coach, ${coachDaysOld}d ago)`,
        watchFor: `${coachGrowth!} (coach, ${coachDaysOld}d ago)`,
        source: 'coach-insights-grace',
        coachInsightAge: coachDaysOld,
        coachInsightLabel: `From your last session (${coachDaysOld} days ago)`,
      };
    }
  }

  // ── P2: C×C independent signal modifier ──
  const ccMod = getCCModifier(clarity, confidence, timeOfDay);
  if (ccMod) {
    if (hasCoachBoth && coachTier === 'contextual') {
      return {
        leanOn: `${ccMod.leanOn} (check-in)`,
        watchFor: `${ccMod.watchFor} (check-in)`,
        source: 'cc-modifier-with-context',
        coachInsightAge: coachDaysOld,
        coachInsightLabel: `Last time you spoke to the coach (${coachDaysOld} days ago)`,
      };
    }
    return { leanOn: `${ccMod.leanOn} (check-in)`, watchFor: `${ccMod.watchFor} (check-in)`, source: 'cc-modifier' };
  }

  // ── Partial coach: mix with other priorities (any non-archived tier) ──
  if (coachStrength && !coachGrowth && coachTier !== 'historical' && coachTier !== 'archived') {
    const watchFor = archetypeMatrix[archetype || '']?.[tier]?.watchFor || tierFallbacks[tier].watchFor;
    const watchSource = archetypeMatrix[archetype || '']?.[tier] ? 'archetype' : 'readiness';
    return { leanOn: `${coachStrength} (coach)`, watchFor: `${watchFor} (${watchSource})`, source: 'coach-partial-strength', coachInsightAge: coachDaysOld };
  }
  if (coachGrowth && !coachStrength && coachTier !== 'historical' && coachTier !== 'archived') {
    const leanOn = archetypeMatrix[archetype || '']?.[tier]?.leanOn || tierFallbacks[tier].leanOn;
    const leanSource = archetypeMatrix[archetype || '']?.[tier] ? 'archetype' : 'readiness';
    return { leanOn: `${leanOn} (${leanSource})`, watchFor: `${coachGrowth} (coach)`, source: 'coach-partial-growth', coachInsightAge: coachDaysOld };
  }

  // ── P4: Archetype × Tier ──
  if (archetype && archetypeMatrix[archetype]?.[tier]) {
    const base = archetypeMatrix[archetype][tier];
    return { leanOn: `${base.leanOn} (archetype)`, watchFor: `${base.watchFor} (archetype)`, source: 'archetype-tier' };
  }

  // ── P5: Tier fallback ──
  const base = tierFallbacks[tier];
  return { leanOn: `${base.leanOn} (readiness)`, watchFor: `${base.watchFor} (readiness)`, source: 'tier-fallback' };
}

// ==================== PATTERN RECOGNITION (all outcomes + C×C) ====================
function getPatternOverride(
  checkIns: Array<{ checkin_date: string; outcome: string; clarity_level?: number | null; confidence_level?: number | null }>,
  currentOutcome: string | null
): string | null {
  if (!checkIns || checkIns.length < 2) return null;

  const sorted = [...checkIns].sort((a, b) =>
    new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
  );

  // ── C×C patterns: 3+ consecutive days of low clarity or low confidence ──
  let lowClarityCount = 0;
  for (const c of sorted) {
    if (c.clarity_level != null && c.clarity_level <= 2) lowClarityCount++;
    else break;
  }
  if (lowClarityCount >= 3) {
    return `Day ${lowClarityCount} with low clarity. Persistent lack of direction across consecutive days points to an unresolved strategic question or missing anchor point. What decision or clarity do you need that you haven't found yet?`;
  }

  let lowConfidenceCount = 0;
  for (const c of sorted) {
    if (c.confidence_level != null && c.confidence_level <= 2) lowConfidenceCount++;
    else break;
  }
  if (lowConfidenceCount >= 3) {
    return `Day ${lowConfidenceCount} with low confidence. Sustained execution doubt across multiple days is rarely about capability. What pattern of self-trust has been compromised?`;
  }

  // ── Outcome patterns: 3+ consecutive days at same outcome ──
  if (!currentOutcome) return null;

  let outcomeCount = 0;
  for (const c of sorted) {
    if (c.outcome === currentOutcome) outcomeCount++;
    else break;
  }

  if (outcomeCount < 3) return null;

  const outcomeSignals: Record<string, string> = {
    overwhelmed: "Sustained overload at this level points to something structural, not something a daily regulation practice alone resolves. What has been consistently missing?",
    drained: "A multi-day depletion pattern signals an accumulating recovery deficit, not a single bad night. Your system may need more than the day's margins can provide.",
    scattered: "Persistent fragmentation across consecutive days points to unresolved open loops or an unprocessed decision backlog. What is still occupying bandwidth that needs to be closed?",
    steady: "Sustained baseline stability is valuable. The question is whether this is protective regulation or avoidance of activation.",
    focused: "Consecutive days of high cognitive activation without corresponding rest can lead to burnout masked as productivity. What's sustaining this, and what's the cost?",
  };

  const signal = outcomeSignals[currentOutcome];
  if (!signal) return null;

  return `Day ${outcomeCount} at this state. Your system is showing a pattern. ${signal}`;
}

// ==================== DATA SOURCES BUILDER ====================
function buildDataSources(
  calendarState: 'active' | 'connected_no_events' | 'not_connected',
  archetype: string | null,
  _checkInOutcome: string | null,
  coachUsed: boolean,
  wearableUsed: boolean,
): string[] {
  const sources: string[] = [];
  sources.push('decision readiness score');
  if (calendarState === 'active') sources.push('calendar');
  else if (calendarState === 'connected_no_events') sources.push('calendar (no upcoming events)');
  if (wearableUsed) sources.push('wearable');
  if (archetype) sources.push('archetype');
  if (coachUsed) sources.push('coach insights');
  return sources;
}

// ==================== MAIN ====================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ComputeRequest & { userId?: string } = await req.json();

    let userId: string;
    if (body.userId) {
      console.log('[compute-outer-readiness] Using userId from body (dev mode):', body.userId);
      userId = body.userId;
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      userId = await verifyAuth0JWT(authHeader, req);
    }
    
    const {
      innerReadinessTier,
      innerReadinessScore,
      clarityLevel,
      confidenceLevel,
      checkInOutcome,
      timezoneOffset = 0,
    } = body;

    // Defensive default: if innerReadinessTier is missing (e.g. compute-inner-readiness failed), fall back to 'managing'
    const safeTier: EnergyTier = innerReadinessTier || 'managing';

    // Compute user's local time
    const userTime = getUserTime(timezoneOffset);
    const hour = userTime.getHours();
    const dayOfWeek = userTime.getDay();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, supabaseKey);

    // ── Server-side calendar metrics: today + tomorrow (for evening forward-look) ──
    // Fetch tomorrow's calendar for any evening (≥18:00), not just late evening
    const lateEvening = isLateEvening(hour);
    const isEvening = hour >= 18 || lateEvening;
    const needTomorrow = isEvening;
    const [calendarResult, tomorrowResult] = await Promise.all([
      getServerCalendarMetrics(db as any, userId, timezoneOffset, 0),
      needTomorrow ? getServerCalendarMetrics(db as any, userId, timezoneOffset, 1) : Promise.resolve(null),
    ]);
    const calendarLoad: CalendarLevel | null = calendarResult.state === 'active' ? calendarResult.load : null;
    const calendarPressure: CalendarLevel | null = calendarResult.state === 'active' ? calendarResult.pressure : null;
    const tomorrowLoad: CalendarLevel | null = tomorrowResult?.state === 'active' ? tomorrowResult.load : null;
    const tomorrowPressure: CalendarLevel | null = tomorrowResult?.state === 'active' ? tomorrowResult.pressure : null;
    const tomorrowHighStakes: string[] = tomorrowResult?.highStakesEvents || [];
    const todayHighStakes: string[] = calendarResult.highStakesEvents || [];

    // ── Fetch wearable data (always – mornings use sleep, evenings use HR/HRV) ──
    let wearableContext: WearableContext | null = null;
    let wearableDataSource: string | null = null;
    try {
      const { data: wearableRow } = await db
        .from('wearable_data')
        .select('hrv, resting_heart_rate, sleep_score, total_sleep_minutes, source')
        .eq('user_id', userId)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wearableRow) {
        const rhr = wearableRow.resting_heart_rate || null;
        const hrv = wearableRow.hrv || null;
        const sleepScore = wearableRow.sleep_score || null;
        const rawSleepDuration = wearableRow.total_sleep_minutes || null;
        const source = wearableRow.source || null;
        wearableDataSource = source;

        // Apple Health correction: reported duration includes "in bed" time
        const sleepDuration = (rawSleepDuration !== null && source === 'apple-healthkit')
          ? Math.round(rawSleepDuration * 0.85)
          : rawSleepDuration;

        // HRV stress: below 30ms absolute (low) – a simple heuristic (will be refined by deviation below)
        const hrvElevated = hrv !== null && hrv < 30;
        // Poor sleep: score < 60 or duration < 6 hours (360 min)
        const poorSleep = (sleepScore !== null && sleepScore < 60) || (sleepDuration !== null && sleepDuration < 360);

        // RHR elevated will be computed from baseline below – placeholder false
        const rhrElevated = false;
        // hrElevated: derived from HRV being significantly depressed (sympathetic dominance = elevated HR)
        // Will be refined by baseline deviation below; initial heuristic: HRV < 25ms
        const hrElevated = hrv !== null && hrv < 25;

        wearableContext = {
          hrv,
          rhr,
          sleepScore,
          sleepDuration,
          hrElevated,
          hrvElevated,
          poorSleep,
          rhrElevated,
          dataSource: source,
        };
      }
    } catch (err) {
      console.error('[compute-outer-readiness] Wearable data fetch error:', err);
    }

    console.log('[compute-outer-readiness] INPUT SUMMARY:', JSON.stringify({
      userId: userId.substring(0, 12) + '...',
      tier: safeTier,
      score: innerReadinessScore,
      clarity: clarityLevel,
      confidence: confidenceLevel,
      checkInOutcome,
      calendarState: calendarResult.state,
      calendarEventCount: calendarResult.eventCount,
      calendarLoad,
      calendarPressure,
      todayHighStakes,
      remainingEvents: calendarResult.remainingEvents,
      remainingHighStakes: calendarResult.remainingHighStakes,
      tomorrowLoad,
      tomorrowPressure,
      tomorrowHighStakes,
      wearablePresent: !!wearableContext,
      wearableHRE: wearableContext?.hrElevated,
      wearableHRVE: wearableContext?.hrvElevated,
      wearablePoorSleep: wearableContext?.poorSleep,
      wearableRHRE: wearableContext?.rhrElevated,
      hour,
      dayOfWeek,
    }));

    // Fetch coach insights, check-ins, archetype, coach memory, commitments, and breakthroughs in parallel
    const [coachRes, checkInRes, profileRes, coachMemoryRes, coachCommitmentsRes, coachBreakthroughsRes] = await Promise.all([
      db.from('user_coach_insights')
        .select('insight_type, insight_content, created_at')
        .eq('user_id', userId)
        .in('insight_type', ['strength', 'growth_area'])
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5),
      db.from('daily_checkins')
        .select('checkin_date, outcome, clarity_level, confidence_level, energy_balance')
        .eq('user_id', userId)
        .gte('checkin_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
        .order('checkin_date', { ascending: false })
        .limit(10),
      db.from('profiles')
        .select('user_archetype, component_scores, practice_priority_tag')
        .eq('id', userId)
        .maybeSingle(),
      // Coach memory: recent memories with importance ≥ 5
      db.from('coach_memory_index')
        .select('memory_content, memory_type, pattern_area, key_themes, importance_score, created_at')
        .eq('user_id', userId)
        .gte('importance_score', 5)
        .order('created_at', { ascending: false })
        .limit(10),
      // Coach commitments: pending
      db.from('coach_accountability_tracker')
        .select('commitment_text, status, meta_skill, pattern_area, committed_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('committed_at', { ascending: false })
        .limit(5),
      // Coach breakthrough moments: recent high-impact breakthroughs
      db.from('coach_breakthrough_moments')
        .select('breakthrough_content, breakthrough_type, meta_skill, pattern_area, impact_score, was_acted_on, created_at')
        .eq('user_id', userId)
        .gte('impact_score', 3)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const coachInsights = coachRes.data || [];
    const recentCheckIns = checkInRes.data || [];
    const serverArchetype = profileRes.data?.user_archetype || null;
    const serverComponentScores = (profileRes.data as any)?.component_scores || computeRequest.componentScores || null;
    const serverPracticePriorityTag = (profileRes.data as any)?.practice_priority_tag || computeRequest.practicePriorityTag || null;
    const coachMemories = coachMemoryRes.data || [];
    const coachCommitments = coachCommitmentsRes.data || [];
    const coachBreakthroughs = coachBreakthroughsRes.data || [];
    
    const strengthInsight = coachInsights.find((i: { insight_type: string }) => i.insight_type === 'strength');
    const growthInsight = coachInsights.find((i: { insight_type: string }) => i.insight_type === 'growth_area');
    const coachStrength = strengthInsight?.insight_content || null;
    const coachGrowth = growthInsight?.insight_content || null;
    const coachInsightCreatedAt = strengthInsight?.created_at || growthInsight?.created_at || null;

    const theme = getTheme(safeTier, calendarPressure, calendarLoad, innerReadinessScore, hour, dayOfWeek, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext, todayHighStakes, calendarResult.eventCount, calendarResult.remainingEvents, calendarResult.remainingHighStakes, calendarResult.meetingCount, calendarResult.remainingMeetings);
    const patternOverride = getPatternOverride(recentCheckIns as Array<{ checkin_date: string; outcome: string; clarity_level?: number | null; confidence_level?: number | null }>, checkInOutcome || null);

    const hasCalendar = calendarLoad !== null && calendarPressure !== null;
    console.log('[compute-outer-readiness] THEME:', JSON.stringify({
      phrase: theme.phrase,
      driver: theme.driver,
      hasCalendar,
      calendarState: calendarResult.state,
      todayHighStakes,
      fallbackReason: !hasCalendar ? (calendarResult.state === 'not_connected' ? 'no_calendar_connection' : calendarResult.state === 'connected_no_events' ? 'connected_no_upcoming_events' : 'unknown') : null,
    }));
    
    // "Strength without clarity" override – independent signals
    const ccProvided = clarityLevel !== null || confidenceLevel !== null;
    let finalPhrase = theme.phrase;
    let finalContext = patternOverride || theme.context;

    // Same-day state shift detection: compare latest 2 check-ins today
    if (!patternOverride && recentCheckIns.length >= 2) {
      const today = new Date().toISOString().split('T')[0];
      const todayCheckins = recentCheckIns.filter((c: any) => c.checkin_date === today);
      if (todayCheckins.length >= 2) {
        const latest = todayCheckins[0];
        const previous = todayCheckins[1];
        const latestEB = latest.energy_balance ?? 50;
        const prevEB = previous.energy_balance ?? 50;
        const drop = prevEB - latestEB;
        const rise = latestEB - prevEB;
        if (drop >= 15) {
          finalContext = `Your latest check-in shows a notable drop in readiness since earlier today. ${theme.context}`;
        } else if (rise >= 15) {
          finalContext = `Your readiness has recovered since your earlier check-in. ${theme.context}`;
        }
      }
    }
    
    if (ccProvided && (safeTier === 'strong' || safeTier === 'peak')) {
      const cLow = clarityLevel !== null && clarityLevel <= 2;
      const confLow = confidenceLevel !== null && confidenceLevel <= 2;
      if (cLow || confLow) {
        finalPhrase = "Strength without clarity.";
        finalContext = "Your felt energy is high, but your internal compass – clarity and confidence – is signalling uncertainty. High activation without direction can lead to misplaced effort. Before deploying your readiness, find your anchor.";
      }
    }
    
    // Phase 2: Wearable recovery check (feature-flagged off)
    let wearableRecovery = null;
    if (ENABLE_WEARABLE_RECOVERY_TRIGGER) {
      wearableRecovery = await checkWearableRecoveryTrigger(userId, db as any);
    }

    const leanOnResult = getLeanOnWatchFor(
      safeTier, serverArchetype, clarityLevel, confidenceLevel,
      coachStrength, coachGrowth, coachInsightCreatedAt, hour, dayOfWeek,
      calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure,
      tomorrowHighStakes, wearableContext, wearableRecovery,
      todayHighStakes, calendarResult.eventCount, calendarResult.remainingEvents
    );

    const coachUsed = leanOnResult.source.startsWith('coach');
    const wearableUsed = !!wearableContext;
    const dataSources = buildDataSources(calendarResult.state, serverArchetype, checkInOutcome, coachUsed, wearableUsed);

    // ═══ STATE STATEMENT BUILDER (calendar-aware, co-located) ═══
    // Build the State card's physiological statement here since we have all signals
    const stateAlreadyUsed: string[] = [];
    let stateStatement = '';
    {
      const calLoad = calendarLoad === 'high' ? 'high' : (calendarLoad === 'medium' ? 'medium' : 'low');
      const hsCount = todayHighStakes.length;
      const isHeavyDay = calLoad === 'high' || hsCount > 0;

      // Detect consecutive tier streak from check-ins
      let consecutiveStreak: { tier: string; count: number } | null = null;
      if (recentCheckIns.length >= 3) {
        const sorted = [...recentCheckIns].sort((a: any, b: any) => 
          new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
        );
        // Map energy_balance to tier
        const getTier = (eb: number) => eb < 40 ? 'depleted' : eb < 60 ? 'managing' : eb < 75 ? 'strong' : 'peak';
        const firstTier = getTier(sorted[0].energy_balance ?? 50);
        let count = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (getTier(sorted[i].energy_balance ?? 50) === firstTier) count++;
          else break;
        }
        if (count >= 3) consecutiveStreak = { tier: firstTier, count };
      }

      // Collect wearable signals
      const signals: Array<{ key: string; text: string; divergence: number }> = [];
      if (wearableContext) {
        if (wearableContext.hrvElevated) {
          signals.push({ key: 'hrv_deviation', text: 'HRV below baseline', divergence: 25 });
        }
        if (wearableContext.poorSleep) {
          const detail = wearableContext.sleepScore ? `sleep below baseline (score: ${wearableContext.sleepScore})` : 'sleep below baseline';
          signals.push({ key: 'sleep_score', text: detail, divergence: 20 });
        } else if (wearableContext.sleepScore && wearableContext.sleepScore >= 80) {
          signals.push({ key: 'sleep_good', text: 'solid sleep', divergence: 10 });
        }
        if (wearableContext.rhrElevated) {
          signals.push({ key: 'rhr_elevated', text: 'resting heart rate above baseline', divergence: 15 });
        }
      }
      signals.sort((a, b) => b.divergence - a.divergence);

      // Build statement
      const tierLabel = safeTier === 'depleted' ? 'Low readiness' : safeTier === 'managing' ? 'Moderate readiness' : safeTier === 'strong' ? 'Strong readiness' : 'Peak readiness';
      const tod = getTimeOfDay(hour);

      if (!wearableContext && !checkInOutcome) {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push('tier_fallback');
      } else if (isHeavyDay && signals.length >= 2) {
        const notable = signals.filter(s => s.divergence >= 15);
        if (notable.length >= 2) {
          stateStatement = `${tierLabel} with ${notable[0].text} and ${notable[1].text} this ${tod}.`;
          notable.slice(0, 2).forEach(s => stateAlreadyUsed.push(s.key));
        } else if (notable.length === 1) {
          const good = signals.find(s => s.key === 'sleep_good');
          if (good) {
            stateStatement = `${tierLabel} with ${good.text} – but ${notable[0].text}, signalling physiological load despite the mental clarity.`;
            stateAlreadyUsed.push(notable[0].key, good.key);
          } else {
            stateStatement = `${tierLabel} this ${tod} – ${notable[0].text}.`;
            stateAlreadyUsed.push(notable[0].key);
          }
        } else {
          stateStatement = `${tierLabel} this ${tod}.`;
          stateAlreadyUsed.push('tier_fallback');
        }
      } else if (signals.length > 0) {
        // Light day: single strongest signal
        stateStatement = `${tierLabel}, ${signals[0].text}.`;
        stateAlreadyUsed.push(signals[0].key);
      } else if (checkInOutcome) {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push('checkin_outcome');
      } else {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push('tier_fallback');
      }

      // Cognitive divergence (second sentence)
      const cHigh = (clarityLevel ?? 3) >= 4;
      const cLow = (clarityLevel ?? 3) <= 2;
      const confHigh = (confidenceLevel ?? 3) >= 4;
      const confLow = (confidenceLevel ?? 3) <= 2;
      if (cHigh && confLow) {
        stateStatement += ' Clarity is strong – but confidence is low, which means the thinking is there but the belief in it isn\'t yet.';
        stateAlreadyUsed.push('clarity_high', 'confidence_low');
      } else if (cLow && confHigh) {
        stateStatement += ' Confidence is high but clarity is low – certainty about an unclear path.';
        stateAlreadyUsed.push('clarity_low', 'confidence_high');
      } else if (cLow && confLow && safeTier !== 'depleted') {
        stateStatement += ' Both clarity and confidence flagged low in your check-in.';
        stateAlreadyUsed.push('clarity_low', 'confidence_low');
      }

      // Streak
      if (consecutiveStreak) {
        stateStatement += ` ${consecutiveStreak.count} days running at this level.`;
        stateAlreadyUsed.push(`streak_${consecutiveStreak.count}d`);
      }
    }

    // ═══ COMPASS INTERSECTION INTELLIGENCE ═══
    // Apply no-repeat rule: if stateAlreadyUsed contains a signal, Compass must not repeat it
    const compassAlreadyUsed = [...stateAlreadyUsed];

    // Coach memory + calendar match for intersection
    if (coachMemories.length > 0 && todayHighStakes.length > 0) {
      // Check if any coach memory relates to an upcoming event type
      const eventTypes = todayHighStakes.map(t => t.toLowerCase());
      const relevantMemory = coachMemories.find((m: any) => {
        const content = (m.memory_content || '').toLowerCase();
        const themes = (m.key_themes || []).map((t: string) => t.toLowerCase());
        return eventTypes.some(et => content.includes(et.split(' ')[0]) || themes.some(th => et.includes(th)));
      });
      if (relevantMemory && !finalContext.includes('coach')) {
        // P1: Coach memory + calendar match – prepend intersection
        const eventRef = `*${todayHighStakes[0]}*`;
        const coachRef = (relevantMemory as any).memory_content.length > 80 
          ? (relevantMemory as any).memory_content.substring(0, 77) + '...'
          : (relevantMemory as any).memory_content;
        finalContext = `You've explored this territory in coaching – ${eventRef} is that moment. ${finalContext}`;
        compassAlreadyUsed.push('coach_memory_match');
      }
    }

    // Coach commitment + event match
    if (coachCommitments.length > 0 && todayHighStakes.length > 0) {
      const eventRef = `*${todayHighStakes[0]}*`;
      const relevantCommitment = coachCommitments.find((c: any) => {
        const text = (c.commitment_text || '').toLowerCase();
        return todayHighStakes.some(e => text.includes(e.toLowerCase().split(' ')[0]));
      });
      if (relevantCommitment && !finalContext.includes('commitment')) {
        finalContext = `You committed to working on this – ${eventRef} is that moment. ${finalContext}`;
        compassAlreadyUsed.push('coach_commitment_match');
      }
    }

    // Coach breakthrough moments + event/pattern match
    if (coachBreakthroughs.length > 0 && !finalContext.includes('breakthrough')) {
      const recentBreakthrough = coachBreakthroughs[0];
      const breakthroughArea = (recentBreakthrough.pattern_area || recentBreakthrough.meta_skill || '').toLowerCase();
      
      // Match breakthrough to high-stakes event
      if (todayHighStakes.length > 0 && breakthroughArea) {
        const eventMatch = todayHighStakes.some((e: string) => e.toLowerCase().includes(breakthroughArea) || breakthroughArea.includes(e.toLowerCase().split(' ')[0]));
        if (eventMatch) {
          finalContext = `A recent coaching breakthrough connects directly to what's ahead today. ${finalContext}`;
          compassAlreadyUsed.push('coach_breakthrough_match');
        }
      }
      
      // Standalone breakthrough awareness (acted on vs not)
      if (!compassAlreadyUsed.includes('coach_breakthrough_match') && recentBreakthrough.impact_score >= 5) {
        if (recentBreakthrough.was_acted_on) {
          finalContext = `You've been acting on a recent coaching breakthrough – sustain that momentum today. ${finalContext}`;
        } else {
          finalContext = `A significant insight from coaching is still untested – today could be the moment to apply it. ${finalContext}`;
        }
        compassAlreadyUsed.push('coach_breakthrough_awareness');
      }
    }

    // Ensure event titles in Compass context use italic formatting (*event_title*)
    // Wrap any 'event_title' references in the context with * markers
    if (todayHighStakes.length > 0) {
      for (const hs of todayHighStakes) {
        // Replace plain 'Title' with *Title* where it appears wrapped in single quotes
        finalContext = finalContext.replace(new RegExp(`'${hs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g'), `*${hs}*`);
      }
    }

    const timeOfDay = getTimeOfDay(hour);
    const today = new Date().toISOString().split('T')[0];
    try {
      await db.from('daily_themes').upsert({
        user_id: userId,
        theme_date: today,
        theme_phrase: finalPhrase,
        theme_driver: theme.driver,
        check_in_outcome: checkInOutcome || null,
        calendar_pressure: calendarPressure || null,
        calendar_load: calendarLoad || null,
        time_of_day: timeOfDay,
        lean_on: leanOnResult.leanOn,
        watch_for: leanOnResult.watchFor,
        inner_readiness_score: innerReadinessScore,
        archetype: serverArchetype,
      }, { onConflict: 'user_id,theme_date' });
    } catch (e) {
      console.error('[compute-outer-readiness] Theme persistence error:', e);
    }

    // ═══ NEW: Compute additional data for DecisionReadinessBrief ═══
    const hasWearable = !!wearableContext;
    const hasCal = calendarLoad !== null && calendarPressure !== null;
    
    // Wearable days connected count
    let wearableDaysConnected = 0;
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { count } = await db
        .from('wearable_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('summary_date', thirtyDaysAgo);
      wearableDaysConnected = count ?? 0;
    } catch (e) { console.error('[compute-outer-readiness] wearable days count error:', e); }

    // HRV/sleep/RHR deviation from 30-day baseline
    let hrvDeviation: number | null = null;
    let sleepDeviation: number | null = null;
    let rhrDeviation: number | null = null;
    let hrvValue: number | null = wearableContext?.hrv ?? null;
    let sleepScoreVal: number | null = wearableContext?.sleepScore ?? null;
    let sleepDuration: number | null = wearableContext?.sleepDuration ?? null;
    let rhrValue: number | null = wearableContext?.rhr ?? null;
    let hrvBaseline: number | null = null;
    let sleepBaseline: number | null = null;
    let rhrBaseline: number | null = null;
    const hasHistoricalData = wearableDaysConnected >= 7;
    try {
      if (hasWearable) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const { data: baseline } = await db
          .from('wearable_data')
          .select('hrv, sleep_score, resting_heart_rate, total_sleep_minutes, source')
          .eq('user_id', userId)
          .gte('summary_date', thirtyDaysAgo)
          .order('summary_date', { ascending: false })
          .limit(30);
        if (baseline && baseline.length >= 3) {
          // HRV baseline
          const hrvRows = baseline.filter((r: any) => r.hrv != null && r.hrv > 0);
          if (hrvRows.length >= 3) {
            const avgHRV = hrvRows.reduce((s: number, r: any) => s + r.hrv, 0) / hrvRows.length;
            hrvBaseline = Math.round(avgHRV);
            if (hrvValue) hrvDeviation = Math.round(((hrvValue - avgHRV) / avgHRV) * 100);
          }

          // Sleep baseline: prefer sleep_score, fallback to duration
          const sleepScoreRows = baseline.filter((r: any) => r.sleep_score != null && r.sleep_score > 0);
          if (sleepScoreRows.length >= 3 && sleepScoreVal != null) {
            const avgSleep = sleepScoreRows.reduce((s: number, r: any) => s + r.sleep_score, 0) / sleepScoreRows.length;
            sleepBaseline = Math.round(avgSleep);
            sleepDeviation = Math.round(((sleepScoreVal - avgSleep) / avgSleep) * 100);
          } else if (sleepDuration != null) {
            // Duration-based fallback (Apple Health)
            const durRows = baseline.filter((r: any) => r.total_sleep_minutes != null && r.total_sleep_minutes > 0);
            if (durRows.length >= 3) {
              const isApple = wearableDataSource === 'apple-healthkit';
              const avgDur = durRows.reduce((s: number, r: any) => {
                const raw = r.total_sleep_minutes;
                return s + (isApple ? raw * 0.85 : raw);
              }, 0) / durRows.length;
              sleepBaseline = Math.round(avgDur);
              sleepDeviation = Math.round(((sleepDuration - avgDur) / avgDur) * 100);
            }
          }

          // RHR baseline (deviation-based, replacing absolute thresholds)
          const rhrRows = baseline.filter((r: any) => r.resting_heart_rate != null && r.resting_heart_rate > 0);
          if (rhrRows.length >= 3 && rhrValue != null) {
            const avgRHR = rhrRows.reduce((s: number, r: any) => s + r.resting_heart_rate, 0) / rhrRows.length;
            rhrBaseline = Math.round(avgRHR);
            rhrDeviation = Math.round(((rhrValue - avgRHR) / avgRHR) * 100);
            // Update wearableContext with deviation-based rhrElevated
            if (wearableContext) {
              wearableContext.rhrElevated = rhrDeviation > 10;
            }
          }

          // Refine hrElevated from HRV baseline deviation (>25% below = sympathetic dominance)
          if (wearableContext && hrvBaseline && hrvValue != null) {
            const hrvPctBelow = ((hrvBaseline - hrvValue) / hrvBaseline) * 100;
            wearableContext.hrElevated = hrvPctBelow > 25;
          }
        }
      }
    } catch (e) { console.error('[compute-outer-readiness] baseline deviation error:', e); }

    // Check-in count total
    let checkInCountTotal = 0;
    try {
      const { count } = await db
        .from('daily_checkins')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      checkInCountTotal = count ?? 0;
    } catch (e) { console.error('[compute-outer-readiness] checkin count error:', e); }

    // Consecutive low confidence days
    let consecutiveLowConfidence = 0;
    try {
      const { data: recentConf } = await db
        .from('daily_checkins')
        .select('confidence_level')
        .eq('user_id', userId)
        .order('checkin_date', { ascending: false })
        .limit(10);
      if (recentConf) {
        for (const c of recentConf) {
          if ((c as any).confidence_level != null && (c as any).confidence_level <= 2) consecutiveLowConfidence++;
          else break;
        }
      }
    } catch (e) { console.error('[compute-outer-readiness] consec confidence error:', e); }

    // Next high-stakes event within 90 mins
    let nextHighStakesEvent: { title: string; minutesUntil: number } | null = null;
    try {
      const now = new Date();
      const ninetyMinsLater = new Date(now.getTime() + 90 * 60000);
      if (todayHighStakes.length > 0) {
        // Re-check calendar events for timing
        const { data: upcoming } = await db
          .from('calendar_events')
          .select('title, start_time')
          .eq('user_id', userId)
          .gte('start_time', now.toISOString())
          .lte('start_time', ninetyMinsLater.toISOString())
          .order('start_time', { ascending: true })
          .limit(5);
        if (upcoming) {
          for (const ev of upcoming) {
            if (todayHighStakes.includes(ev.title)) {
              const mins = Math.round((new Date(ev.start_time).getTime() - now.getTime()) / 60000);
              nextHighStakesEvent = { title: ev.title, minutesUntil: mins };
              break;
            }
          }
        }
      }
    } catch (e) { console.error('[compute-outer-readiness] next HS event error:', e); }

    // ═══ LLM SYNTHESIS ═══
    let llmPhrase: string | null = null;
    let llmBodyText: string | null = null;
    const dataCompleteness = checkInCountTotal === 0 ? 'day1' : checkInCountTotal <= 6 ? 'early' : checkInCountTotal <= 30 ? 'developing' : 'established';

    // ── Additional enrichment data for the upgraded LLM prompt ──
    let yesterdayScore: number | null = null;
    let scoreTrend: string | null = null;
    let hasBackToBack = false;
    let longestBackToBackHrs: number | null = null;
    let nextEventAny: { title: string; minutesUntil: number } | null = null;
    let practicesCompletedThisWeek = 0;
    let practiceCompletionRate = 0;
    let daysSinceCoachSession: number | null = null;
    let coachSessionImpactDelta: number | null = null;
    let avgScore7d: number | null = null;
    let scoreTrajectory7d: string | null = null;
    let wearableTrend7d: string | null = null;
    let typicalDOWOutcome: string | null = null;
    let typicalDOWScore: number | null = null;
    let frictionTrend: string | null = null;
    let dominantOutcome7d: string | null = null;
    let pendingCommitment: string | null = null;
    let recentPattern: string | null = null;
    let divergenceMode: string | null = null;
    let isPublicHoliday = false;
    let holidayName: string | null = null;
    let isDayBeforeRestDay = false;
    let tomorrowFirstEventTime: string | null = null;
    let tomorrowVsTodayLoad: string | null = null;
    let tomorrowHighStakesTitles: string[] = [];
    let weekAheadShape: Record<string, unknown> | null = null;
    let hrvEventCorrelation: string | null = null;
    let mostEffectivePractice: string | null = null;
    let stateShiftToday = false;
    let stateShiftDirection: string | null = null;

    if (dataCompleteness !== 'day1') {
      // ── Detect state shift from earlier code (lines 2094-2111 computed todayCheckins) ──
      {
        const today2 = new Date().toISOString().split('T')[0];
        const todayCheckins2 = recentCheckIns.filter((c: any) => c.checkin_date === today2);
        if (todayCheckins2.length >= 2) {
          const latestEB = todayCheckins2[0].energy_balance ?? 50;
          const prevEB = todayCheckins2[1].energy_balance ?? 50;
          const delta = latestEB - prevEB;
          if (Math.abs(delta) >= 15) {
            stateShiftToday = true;
            stateShiftDirection = delta > 0 ? 'improving' : 'declining';
          }
        }
      }

      // ── Wearable divergence mode ──
      if (wearableContext && checkInOutcome) {
        const positiveStates = ['thriving', 'steady', 'focused', 'energised', 'confident'];
        const negativeStates = ['drained', 'scattered', 'overwhelmed', 'struggling', 'depleted'];
        const feltPositive = positiveStates.includes(checkInOutcome);
        const feltNegative = negativeStates.includes(checkInOutcome);
        const wearableStrained = wearableContext.hrvElevated || wearableContext.poorSleep || wearableContext.rhrElevated;
        const wearableGood = !wearableContext.hrvElevated && !wearableContext.poorSleep && !wearableContext.rhrElevated
          && (wearableContext.sleepScore ? wearableContext.sleepScore >= 75 : true);
        if (feltPositive && wearableStrained) divergenceMode = 'MASKED_HIGH';
        else if (feltNegative && wearableGood) divergenceMode = 'RECOVERY_UNDERWAY';
        else divergenceMode = 'ALIGNED';
      }

      // ── Static holiday lookup (UK/US/UAE/SG/AU 2025-2026) ──
      const HOLIDAYS: Record<string, Array<{ date: string; name: string }>> = {
        'GB': [
          { date: '2025-01-01', name: "New Year's Day" }, { date: '2025-04-18', name: 'Good Friday' },
          { date: '2025-04-21', name: 'Easter Monday' }, { date: '2025-05-05', name: 'Early May Bank Holiday' },
          { date: '2025-05-26', name: 'Spring Bank Holiday' }, { date: '2025-08-25', name: 'Summer Bank Holiday' },
          { date: '2025-12-25', name: 'Christmas Day' }, { date: '2025-12-26', name: 'Boxing Day' },
          { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-04-03', name: 'Good Friday' },
          { date: '2026-04-06', name: 'Easter Monday' }, { date: '2026-05-04', name: 'Early May Bank Holiday' },
          { date: '2026-05-25', name: 'Spring Bank Holiday' }, { date: '2026-08-31', name: 'Summer Bank Holiday' },
          { date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-12-28', name: 'Boxing Day (substitute)' },
        ],
        'US': [
          { date: '2025-01-01', name: "New Year's Day" }, { date: '2025-01-20', name: 'MLK Day' },
          { date: '2025-02-17', name: "Presidents' Day" }, { date: '2025-05-26', name: 'Memorial Day' },
          { date: '2025-07-04', name: 'Independence Day' }, { date: '2025-09-01', name: 'Labor Day' },
          { date: '2025-11-27', name: 'Thanksgiving' }, { date: '2025-12-25', name: 'Christmas Day' },
          { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-01-19', name: 'MLK Day' },
          { date: '2026-05-25', name: 'Memorial Day' }, { date: '2026-07-03', name: 'Independence Day (observed)' },
          { date: '2026-09-07', name: 'Labor Day' }, { date: '2026-11-26', name: 'Thanksgiving' },
          { date: '2026-12-25', name: 'Christmas Day' },
        ],
        'AE': [
          { date: '2025-01-01', name: "New Year's Day" }, { date: '2025-03-30', name: 'Eid al-Fitr' },
          { date: '2025-03-31', name: 'Eid al-Fitr' }, { date: '2025-06-06', name: 'Eid al-Adha' },
          { date: '2025-06-07', name: 'Eid al-Adha' }, { date: '2025-12-02', name: 'National Day' },
          { date: '2025-12-03', name: 'National Day' },
          { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-03-20', name: 'Eid al-Fitr' },
          { date: '2026-05-27', name: 'Eid al-Adha' }, { date: '2026-12-02', name: 'National Day' },
        ],
        'SG': [
          { date: '2025-01-01', name: "New Year's Day" }, { date: '2025-01-29', name: 'Chinese New Year' },
          { date: '2025-01-30', name: 'Chinese New Year' }, { date: '2025-04-18', name: 'Good Friday' },
          { date: '2025-05-01', name: 'Labour Day' }, { date: '2025-05-12', name: 'Vesak Day' },
          { date: '2025-06-07', name: 'Hari Raya Haji' }, { date: '2025-08-09', name: 'National Day' },
          { date: '2025-10-20', name: 'Deepavali' }, { date: '2025-12-25', name: 'Christmas Day' },
          { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-02-17', name: 'Chinese New Year' },
          { date: '2026-02-18', name: 'Chinese New Year' }, { date: '2026-04-03', name: 'Good Friday' },
          { date: '2026-05-01', name: 'Labour Day' }, { date: '2026-08-09', name: 'National Day' },
          { date: '2026-12-25', name: 'Christmas Day' },
        ],
        'AU': [
          { date: '2025-01-01', name: "New Year's Day" }, { date: '2025-01-27', name: 'Australia Day' },
          { date: '2025-04-18', name: 'Good Friday' }, { date: '2025-04-21', name: 'Easter Monday' },
          { date: '2025-04-25', name: 'ANZAC Day' }, { date: '2025-12-25', name: 'Christmas Day' },
          { date: '2025-12-26', name: 'Boxing Day' },
          { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-01-26', name: 'Australia Day' },
          { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-04-06', name: 'Easter Monday' },
          { date: '2026-04-25', name: 'ANZAC Day' }, { date: '2026-12-25', name: 'Christmas Day' },
          { date: '2026-12-28', name: 'Boxing Day (substitute)' },
        ],
      };

      // Derive country from timezone
      const tzToCountry: Record<string, string> = {
        'Europe/London': 'GB', 'Europe/Belfast': 'GB',
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
        'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
        'Asia/Dubai': 'AE', 'Asia/Abu_Dhabi': 'AE',
        'Asia/Singapore': 'SG',
        'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
        'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
      };

      try {
        const { data: profileTz } = await db.from('profiles').select('timezone').eq('id', userId).maybeSingle();
        const userTz = (profileTz as any)?.timezone || null;
        const userCountry = userTz ? tzToCountry[userTz] || null : null;
        const localDate = userTime.toISOString().split('T')[0];
        const tomorrowDate = new Date(userTime.getTime() + 86400000).toISOString().split('T')[0];

        if (userCountry && HOLIDAYS[userCountry]) {
          const todayHol = HOLIDAYS[userCountry].find(h => h.date === localDate);
          if (todayHol) { isPublicHoliday = true; holidayName = todayHol.name; }
          const tomorrowHol = HOLIDAYS[userCountry].find(h => h.date === tomorrowDate);
          if (tomorrowHol) isDayBeforeRestDay = true;
        }
      } catch (e) { /* ignore holiday lookup failure */ }

      // Friday = day before rest
      if (dayOfWeek === 5) isDayBeforeRestDay = true;

      // Check for personal holiday/OOO in tomorrow's calendar
      if (tomorrowResult && tomorrowResult.state === 'active') {
        try {
          const oooPatterns = /\b(holiday|ooo|pto|leave|day\s*off|vacation|annual\s*leave|out\s*of\s*office)\b/i;
          const tomorrowDateObj = new Date(userTime.getTime() + 86400000);
          const tStart = new Date(Date.UTC(tomorrowDateObj.getUTCFullYear(), tomorrowDateObj.getUTCMonth(), tomorrowDateObj.getUTCDate(), 0, 0, 0));
          const tEnd = new Date(Date.UTC(tomorrowDateObj.getUTCFullYear(), tomorrowDateObj.getUTCMonth(), tomorrowDateObj.getUTCDate(), 23, 59, 59));
          const tStartUTC = new Date(tStart.getTime() + timezoneOffset * 60000);
          const tEndUTC = new Date(tEnd.getTime() + timezoneOffset * 60000);
          const { data: tomorrowEvents } = await db
            .from('calendar_events')
            .select('title, start_time, end_time')
            .eq('user_id', userId)
            .gte('start_time', tStartUTC.toISOString())
            .lte('start_time', tEndUTC.toISOString());
          if (tomorrowEvents) {
            for (const ev of tomorrowEvents) {
              const dur = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 3600000;
              if (dur >= 4 && ev.title && oooPatterns.test(ev.title)) {
                isDayBeforeRestDay = true;
                break;
              }
            }
          }
        } catch (e) { /* ignore */ }
      }

      // ── Parallel enrichment queries ──
      try {
        const nowISO = new Date().toISOString();
        const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
        const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

        const [
          yesterdayRes,
          nextEventRes,
          practicesRes,
          coachSessionRes,
          wearable7dRes,
          dowCheckinsRes,
          commitmentRes,
          patternRes,
          effectivePracticeRes,
          recentCheckinsRes,
        ] = await Promise.all([
          // 1. Yesterday's score
          db.from('daily_checkins').select('energy_balance').eq('user_id', userId).eq('checkin_date', yesterdayDate).order('created_at', { ascending: false }).limit(1).maybeSingle().catch(() => ({ data: null })),
          // 3. Next event (any)
          db.from('calendar_events').select('title, start_time').eq('user_id', userId).gt('start_time', nowISO).order('start_time', { ascending: true }).limit(1).maybeSingle().catch(() => ({ data: null })),
          // 4. Practice completion this week
          db.from('sanctuary_events').select('id, content_id').eq('user_id', userId).eq('event_type', 'completed').gte('created_at', sevenAgo).catch(() => ({ data: null })),
          // 5. Coach session recency
          db.from('coach_session_summaries').select('created_at, session_id, user_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle().catch(() => ({ data: null })),
          // 7. Wearable trend (7d)
          hasWearable ? db.from('wearable_data').select('hrv, summary_date').eq('user_id', userId).gte('summary_date', sevenAgo).order('summary_date', { ascending: true }).limit(7).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
          // 8. DOW checkins (60 days)
          db.from('daily_checkins').select('outcome, energy_balance, checkin_date').eq('user_id', userId).gte('checkin_date', new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0]).catch(() => ({ data: null })),
          // Pending commitment
          db.from('coach_accountability_tracker').select('commitment_text').eq('user_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle().catch(() => ({ data: null })),
          // Recent pattern
          db.from('coach_pattern_observations').select('pattern_description').eq('user_id', userId).eq('is_active', true).gte('last_observed_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('observation_count', { ascending: false }).limit(1).maybeSingle().catch(() => ({ data: null })),
          // Most effective practice
          db.from('sanctuary_events').select('content_id, effectiveness_rating').eq('user_id', userId).not('effectiveness_rating', 'is', null).order('effectiveness_rating', { ascending: false }).limit(10).catch(() => ({ data: null })),
          // 14-day checkins for friction trend
          db.from('daily_checkins').select('outcome, checkin_date, energy_balance').eq('user_id', userId).gte('checkin_date', fourteenAgo).order('checkin_date', { ascending: false }).catch(() => ({ data: null })),
        ]);

        // 1. Yesterday score + trend
        if (yesterdayRes.data) {
          yesterdayScore = (yesterdayRes.data as any).energy_balance ?? null;
          if (yesterdayScore != null) {
            const delta = innerReadinessScore - yesterdayScore;
            scoreTrend = delta > 5 ? 'improving' : delta < -5 ? 'declining' : 'stable';
          }
        }

        // 2. Back-to-back detection (from calendarResult events — re-query sorted events)
        try {
          if (calendarResult.state === 'active' && calendarResult.eventCount > 1) {
            const userNow2 = new Date(new Date().getTime() - timezoneOffset * 60000);
            const dayStart = new Date(Date.UTC(userNow2.getUTCFullYear(), userNow2.getUTCMonth(), userNow2.getUTCDate(), 0, 0, 0));
            const dayEnd = new Date(Date.UTC(userNow2.getUTCFullYear(), userNow2.getUTCMonth(), userNow2.getUTCDate(), 23, 59, 59));
            const startUTC2 = new Date(dayStart.getTime() + timezoneOffset * 60000);
            const endUTC2 = new Date(dayEnd.getTime() + timezoneOffset * 60000);
            const { data: sortedEvts } = await db
              .from('calendar_events')
              .select('start_time, end_time, title')
              .eq('user_id', userId)
              .gte('start_time', startUTC2.toISOString())
              .lte('start_time', endUTC2.toISOString())
              .order('start_time', { ascending: true });
            if (sortedEvts && sortedEvts.length > 1) {
              let maxBlock = 0;
              let currentBlock = 0;
              for (let i = 0; i < sortedEvts.length - 1; i++) {
                const gap = (new Date(sortedEvts[i + 1].start_time).getTime() - new Date(sortedEvts[i].end_time).getTime()) / 60000;
                if (gap < 10) {
                  if (currentBlock === 0) {
                    currentBlock = (new Date(sortedEvts[i].end_time).getTime() - new Date(sortedEvts[i].start_time).getTime()) / 3600000;
                  }
                  currentBlock += (new Date(sortedEvts[i + 1].end_time).getTime() - new Date(sortedEvts[i + 1].start_time).getTime()) / 3600000;
                  hasBackToBack = true;
                } else {
                  if (currentBlock > maxBlock) maxBlock = currentBlock;
                  currentBlock = 0;
                }
              }
              if (currentBlock > maxBlock) maxBlock = currentBlock;
              if (maxBlock > 0) longestBackToBackHrs = Math.round(maxBlock * 10) / 10;
            }
          }
        } catch (e) { /* ignore */ }

        // 3. Next event (any)
        if (nextEventRes.data) {
          const ev = nextEventRes.data as any;
          const mins = Math.round((new Date(ev.start_time).getTime() - Date.now()) / 60000);
          if (mins > 0 && mins < 720) nextEventAny = { title: ev.title || 'Untitled', minutesUntil: mins };
        }

        // 4. Practices this week
        if (practicesRes.data) {
          practicesCompletedThisWeek = (practicesRes.data as any[]).length;
          practiceCompletionRate = Math.round((practicesCompletedThisWeek / 7) * 100);
        }

        // 5. Coach session recency + impact
        if (coachSessionRes.data) {
          const sessionDate = new Date((coachSessionRes.data as any).created_at);
          daysSinceCoachSession = Math.floor((Date.now() - sessionDate.getTime()) / 86400000);
          // Impact: compare day-of-session vs next-day check-in
          try {
            const sessionDateStr = sessionDate.toISOString().split('T')[0];
            const nextDayStr = new Date(sessionDate.getTime() + 86400000).toISOString().split('T')[0];
            const [{ data: sessionDay }, { data: nextDay }] = await Promise.all([
              db.from('daily_checkins').select('energy_balance').eq('user_id', userId).eq('checkin_date', sessionDateStr).order('created_at', { ascending: false }).limit(1).maybeSingle(),
              db.from('daily_checkins').select('energy_balance').eq('user_id', userId).eq('checkin_date', nextDayStr).order('created_at', { ascending: false }).limit(1).maybeSingle(),
            ]);
            if (sessionDay?.energy_balance != null && nextDay?.energy_balance != null) {
              coachSessionImpactDelta = nextDay.energy_balance - sessionDay.energy_balance;
            }
          } catch (e) { /* ignore */ }
        }

        // 6. 7-day avg + trajectory from recentCheckIns
        if (recentCheckIns.length >= 2) {
          const scores = recentCheckIns.filter((c: any) => c.energy_balance != null).map((c: any) => c.energy_balance as number);
          if (scores.length >= 2) {
            avgScore7d = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
            const mid = Math.floor(scores.length / 2);
            const firstHalf = scores.slice(mid); // older (recentCheckIns is desc)
            const secondHalf = scores.slice(0, mid); // newer
            const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
            const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
            const diff = avgSecond - avgFirst;
            scoreTrajectory7d = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
          }
        }

        // 7. Wearable trend (7d)
        if (wearable7dRes.data && (wearable7dRes.data as any[]).length >= 4) {
          const rows = (wearable7dRes.data as any[]).filter(r => r.hrv != null);
          if (rows.length >= 4) {
            const mid = Math.floor(rows.length / 2);
            const first = rows.slice(0, mid);
            const second = rows.slice(mid);
            const avgFirst = first.reduce((s: number, r: any) => s + r.hrv, 0) / first.length;
            const avgSecond = second.reduce((s: number, r: any) => s + r.hrv, 0) / second.length;
            const diff = ((avgSecond - avgFirst) / avgFirst) * 100;
            wearableTrend7d = diff > 10 ? 'improving' : diff < -10 ? 'declining' : 'stable';
          }
        }

        // 8. DOW typical outcome + score
        if (dowCheckinsRes.data && (dowCheckinsRes.data as any[]).length >= 4) {
          const allDow = (dowCheckinsRes.data as any[]);
          const sameDow = allDow.filter((c: any) => {
            const d = new Date(c.checkin_date + 'T00:00:00');
            return d.getDay() === dayOfWeek;
          });
          if (sameDow.length >= 4) {
            const counts: Record<string, number> = {};
            for (const c of sameDow) { counts[c.outcome] = (counts[c.outcome] || 0) + 1; }
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (top) typicalDOWOutcome = top[0];
            const dowScores = sameDow.filter((c: any) => c.energy_balance != null).map((c: any) => c.energy_balance as number);
            if (dowScores.length >= 4) typicalDOWScore = Math.round(dowScores.reduce((s, v) => s + v, 0) / dowScores.length);
          }
        }

        // Friction trend + dominant outcome 7d
        if (recentCheckinsRes.data) {
          const allCheckins = recentCheckinsRes.data as any[];
          const frictionOutcomes = ['drained', 'scattered', 'overwhelmed'];
          const recent7 = allCheckins.filter(c => c.checkin_date >= sevenAgo);
          const prev7 = allCheckins.filter(c => c.checkin_date < sevenAgo);
          const recentFriction = recent7.filter(c => frictionOutcomes.includes(c.outcome)).length;
          const prevFriction = prev7.filter(c => frictionOutcomes.includes(c.outcome)).length;
          if (prev7.length > 0) {
            const diff = (recentFriction / Math.max(recent7.length, 1)) - (prevFriction / Math.max(prev7.length, 1));
            frictionTrend = diff < -0.1 ? 'improving' : diff > 0.1 ? 'declining' : 'stable';
          }
          const counts7: Record<string, number> = {};
          for (const c of recent7) { counts7[c.outcome] = (counts7[c.outcome] || 0) + 1; }
          const topOutcome = Object.entries(counts7).sort((a, b) => b[1] - a[1])[0];
          if (topOutcome) dominantOutcome7d = topOutcome[0];
        }

        // Pending commitment
        pendingCommitment = (commitmentRes.data as any)?.commitment_text ?? null;

        // Recent pattern
        recentPattern = (patternRes.data as any)?.pattern_description ?? null;

        // Most effective practice
        if (effectivePracticeRes.data && (effectivePracticeRes.data as any[]).length > 0) {
          mostEffectivePractice = (effectivePracticeRes.data as any[])[0].content_id ?? null;
        }

        // 9. Tomorrow enhanced
        if (tomorrowResult && tomorrowResult.state === 'active') {
          tomorrowHighStakesTitles = tomorrowHighStakes;
          // Tomorrow vs today load comparison
          const loadRank: Record<string, number> = { 'low': 1, 'medium': 2, 'high': 3 };
          const todayRank = loadRank[calendarLoad || 'low'] || 1;
          const tomorrowRank = loadRank[tomorrowLoad || 'low'] || 1;
          tomorrowVsTodayLoad = tomorrowRank > todayRank ? 'heavier' : tomorrowRank < todayRank ? 'lighter' : 'similar';

          // Tomorrow first event time
          try {
            const tomorrowDateObj = new Date(userTime.getTime() + 86400000);
            const tStart = new Date(Date.UTC(tomorrowDateObj.getUTCFullYear(), tomorrowDateObj.getUTCMonth(), tomorrowDateObj.getUTCDate(), 0, 0, 0));
            const tEnd = new Date(Date.UTC(tomorrowDateObj.getUTCFullYear(), tomorrowDateObj.getUTCMonth(), tomorrowDateObj.getUTCDate(), 23, 59, 59));
            const tStartUTC = new Date(tStart.getTime() + timezoneOffset * 60000);
            const tEndUTC = new Date(tEnd.getTime() + timezoneOffset * 60000);
            const { data: tFirstEvt } = await db.from('calendar_events').select('start_time').eq('user_id', userId)
              .gte('start_time', tStartUTC.toISOString()).lte('start_time', tEndUTC.toISOString())
              .order('start_time', { ascending: true }).limit(1).maybeSingle();
            if (tFirstEvt) {
              const evTime = new Date(new Date(tFirstEvt.start_time).getTime() - timezoneOffset * 60000);
              tomorrowFirstEventTime = `${String(evTime.getUTCHours()).padStart(2, '0')}:${String(evTime.getUTCMinutes()).padStart(2, '0')}`;
            }
          } catch (e) { /* ignore */ }
        }

        // 10. Week-ahead (Sunday evening only)
        const isSundayEvening = dayOfWeek === 0 && hour >= 17;
        if (isSundayEvening && calendarResult.state !== 'not_connected') {
          try {
            const weekEvents: Array<{ day: string; count: number; hsCount: number }> = [];
            for (let d = 1; d <= 5; d++) { // Mon-Fri
              const targetDayRes = await getServerCalendarMetrics(db as any, userId, timezoneOffset, d);
              const targetDate = new Date(userTime.getTime() + d * 86400000);
              const dayName = dayNames[targetDate.getDay()];
              weekEvents.push({
                day: dayName,
                count: targetDayRes.meetingCount,
                hsCount: targetDayRes.highStakesEvents.length,
              });
            }
            const heaviest = weekEvents.reduce((max, d) => d.count > max.count ? d : max, weekEvents[0]);
            const totalHS = weekEvents.reduce((s, d) => s + d.hsCount, 0);
            const lightDays = weekEvents.filter(d => d.count <= 1).map(d => d.day);
            const firstHS = weekEvents.find(d => d.hsCount > 0);

            // Monday first event
            let mondayFirstEvent: { title: string; time: string; isHighStakes: boolean } | null = null;
            try {
              const monDate = new Date(userTime.getTime() + 86400000);
              const mStart = new Date(Date.UTC(monDate.getUTCFullYear(), monDate.getUTCMonth(), monDate.getUTCDate(), 0, 0, 0));
              const mEnd = new Date(Date.UTC(monDate.getUTCFullYear(), monDate.getUTCMonth(), monDate.getUTCDate(), 23, 59, 59));
              const mStartUTC = new Date(mStart.getTime() + timezoneOffset * 60000);
              const mEndUTC = new Date(mEnd.getTime() + timezoneOffset * 60000);
              const { data: monFirst } = await db.from('calendar_events').select('title, start_time')
                .eq('user_id', userId).gte('start_time', mStartUTC.toISOString()).lte('start_time', mEndUTC.toISOString())
                .order('start_time', { ascending: true }).limit(1).maybeSingle();
              if (monFirst) {
                const evTime = new Date(new Date(monFirst.start_time).getTime() - timezoneOffset * 60000);
                const timeStr = `${String(evTime.getUTCHours()).padStart(2, '0')}:${String(evTime.getUTCMinutes()).padStart(2, '0')}`;
                const monMetrics = weekEvents[0]; // Monday is index 0
                mondayFirstEvent = { title: monFirst.title || 'Untitled', time: timeStr, isHighStakes: monMetrics.hsCount > 0 };
              }
            } catch (e) { /* ignore */ }

            weekAheadShape = {
              heaviestDay: heaviest.day,
              heaviestDayLoad: heaviest.count >= 4 ? 'high' : heaviest.count >= 2 ? 'medium' : 'low',
              totalHighStakesNextWeek: totalHS,
              firstHighStakesDay: firstHS?.day ?? null,
              lightDaysNextWeek: lightDays,
              mondayLoad: weekEvents[0].count >= 4 ? 'high' : weekEvents[0].count >= 2 ? 'medium' : weekEvents[0].count > 0 ? 'low' : 'none',
              mondayHasHighStakes: weekEvents[0].hsCount > 0,
              mondayFirstEvent,
            };
          } catch (e) { console.error('[compute-outer-readiness] week-ahead error:', e); }
        }

        // 14. HRV correlation for event type (lightweight)
        if (hasWearable && todayHighStakes.length > 0 && wearableDaysConnected >= 7) {
          try {
            const keyword = todayHighStakes[0].split(/\s+/).filter(w => w.length > 3 && !/^(the|and|for|with|from)$/i.test(w))[0];
            if (keyword) {
              const { data: similarEvents } = await db.from('calendar_events')
                .select('start_time').eq('user_id', userId)
                .ilike('title', `%${keyword}%`)
                .gte('start_time', thirtyAgo)
                .lt('start_time', new Date().toISOString());
              if (similarEvents && similarEvents.length >= 3) {
                const eventDates = similarEvents.map(e => new Date(e.start_time).toISOString().split('T')[0]);
                const uniqueDates = [...new Set(eventDates)];
                if (uniqueDates.length >= 3) {
                  const { data: eventDayHRV } = await db.from('wearable_data')
                    .select('hrv, summary_date').eq('user_id', userId)
                    .in('summary_date', uniqueDates);
                  const { data: allHRV } = await db.from('wearable_data')
                    .select('hrv').eq('user_id', userId)
                    .gte('summary_date', thirtyAgo);
                  if (eventDayHRV && allHRV) {
                    const eventHRVs = (eventDayHRV as any[]).filter(r => r.hrv != null).map(r => r.hrv);
                    const allHRVs = (allHRV as any[]).filter(r => r.hrv != null).map(r => r.hrv);
                    if (eventHRVs.length >= 3 && allHRVs.length >= 5) {
                      const avgEvent = eventHRVs.reduce((s, v) => s + v, 0) / eventHRVs.length;
                      const avgAll = allHRVs.reduce((s, v) => s + v, 0) / allHRVs.length;
                      const pctDiff = Math.round(((avgEvent - avgAll) / avgAll) * 100);
                      if (Math.abs(pctDiff) >= 10) {
                        const direction = pctDiff < 0 ? 'drops' : 'rises';
                        hrvEventCorrelation = `HRV ${direction} avg ${Math.abs(pctDiff)}% before ${keyword} meetings — ${eventHRVs.length} occurrences`;
                      }
                    }
                  }
                }
              }
            }
          } catch (e) { /* ignore HRV correlation failure */ }
        }

      } catch (enrichErr) {
        console.error('[compute-outer-readiness] Enrichment queries error:', enrichErr);
      }

      // ── Build & call LLM ──
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (LOVABLE_API_KEY) {
          const timeOfDayStr = getTimeOfDay(hour);
          const dayNames2 = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
          const dayName = dayNames2[dayOfWeek];
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isMondayMorning = dayOfWeek === 1 && hour < 12;
          const isFridayEvening = dayOfWeek === 5 && hour >= 17;
          const isSundayEvening2 = dayOfWeek === 0 && hour >= 17;
          const hoursRemaining = hour < 19 ? 19 - hour : null;
          const localTimeStr = `${String(hour).padStart(2, '0')}:${String(userTime.getMinutes()).padStart(2, '0')}`;

          // Wearable confidence
          const wearableConfidence = !hasWearable ? null : wearableDaysConnected >= 14 ? 'high' : wearableDaysConnected >= 7 ? 'medium' : 'low';
          // HRV unusual (worst/best 10%)
          let hrvUnusual: boolean | null = null;
          if (hrvDeviation != null) hrvUnusual = Math.abs(hrvDeviation) >= 25;
          // Sleep hard floor
          const sleepHardFloor = sleepDuration != null && sleepDuration < 360;
          // Day after poor sleep
          let dayAfterPoorSleep = false;
          try {
            if (hasWearable) {
              const ydayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
              const { data: ydaySleep } = await db.from('wearable_data').select('total_sleep_minutes').eq('user_id', userId).eq('summary_date', ydayDate).maybeSingle();
              if (ydaySleep && (ydaySleep as any).total_sleep_minutes != null && (ydaySleep as any).total_sleep_minutes < 360) dayAfterPoorSleep = true;
            }
          } catch (e) { /* ignore */ }

          // Consecutive low days
          let consecutiveLowDays = 0;
          for (const c of recentCheckIns) {
            if ((c as any).energy_balance != null && (c as any).energy_balance < 50) consecutiveLowDays++;
            else break;
          }

          // DOW score comparison
          let scoreVsTypicalDOW: string | null = null;
          if (typicalDOWScore != null) {
            const diff = innerReadinessScore - typicalDOWScore;
            scoreVsTypicalDOW = diff > 8 ? 'better' : diff < -8 ? 'worse' : 'consistent';
          }

          // ── Signal Triage: select max 5 most relevant signals ──
          const triageSignals: string[] = [];

          // RULE 1: JIT event < 90 mins — always first, dominates
          if (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90) {
            triageSignals.push(`HIGH PRIORITY: ${nextHighStakesEvent.title} in ${nextHighStakesEvent.minutesUntil} mins`);
            if (hrvEventCorrelation) triageSignals.push(`Pattern: ${hrvEventCorrelation}`);
          }

          // RULE 2: Wearable divergence MASKED_HIGH
          if (divergenceMode === 'MASKED_HIGH') {
            triageSignals.push(`Body signal: wearable shows load not yet registered (HRV ${hrvDeviation != null ? (hrvDeviation > 0 ? '+' : '') + hrvDeviation : '?'}% vs baseline)`);
          } else if (divergenceMode === 'RECOVERY_UNDERWAY') {
            triageSignals.push(`Body signal: recovery underway — wearable improving faster than perceived`);
          }

          // RULE 3: Most specific personalisation (cascade)
          if (pendingCommitment) {
            triageSignals.push(`Coach commitment: ${pendingCommitment}`);
          } else if (recentPattern) {
            triageSignals.push(`Coach pattern: ${recentPattern}`);
          } else if (consecutiveLowDays >= 3) {
            triageSignals.push(`Pattern: ${consecutiveLowDays} consecutive ${safeTier} days`);
          } else if (typicalDOWOutcome && scoreVsTypicalDOW && scoreVsTypicalDOW !== 'consistent') {
            triageSignals.push(`Today vs typical ${dayName}: ${scoreVsTypicalDOW} (usually ${typicalDOWOutcome})`);
          }

          // RULE 4: Tomorrow context on evenings
          if ((isEvening || isFridayEvening || isSundayEvening2) && tomorrowLoad) {
            if (isDayBeforeRestDay) {
              triageSignals.push(`Tomorrow: rest day ahead`);
            } else if (tomorrowLoad === 'high' || tomorrowHighStakesTitles.length > 0) {
              triageSignals.push(`Tomorrow: ${tomorrowLoad} load${tomorrowHighStakesTitles.length > 0 ? ' · ' + tomorrowHighStakesTitles[0] : ''}`);
            }
          }

          // RULE 5: Week ahead (Sunday evening only)
          if (isSundayEvening2 && weekAheadShape) {
            const wa = weekAheadShape as any;
            triageSignals.push(`Week ahead: heaviest day ${wa.heaviestDay}${wa.firstHighStakesDay ? ' · first high-stakes: ' + wa.firstHighStakesDay : ''}`);
          }

          // RULE 6: Physiological deviation (if not already covered by divergence)
          if (divergenceMode !== 'MASKED_HIGH' && divergenceMode !== 'RECOVERY_UNDERWAY') {
            if (hrvDeviation != null && Math.abs(hrvDeviation) > 8) {
              triageSignals.push(`HRV ${hrvDeviation > 0 ? '+' : ''}${hrvDeviation}% vs baseline`);
            } else if (sleepHardFloor) {
              triageSignals.push(`Sleep under 6hrs — hard floor breach`);
            }
          }

          // RULE 7: Score trajectory vs yesterday (if meaningful)
          if (scoreTrend && yesterdayScore != null && Math.abs(innerReadinessScore - yesterdayScore) > 5) {
            triageSignals.push(`Score ${scoreTrend} vs yesterday: ${innerReadinessScore} vs ${yesterdayScore}`);
          }

          // RULE 8: Back-to-back density
          if (hasBackToBack && longestBackToBackHrs && longestBackToBackHrs >= 2) {
            triageSignals.push(`Back-to-back block: ${longestBackToBackHrs}hrs`);
          }

          // Cap at 5 signals
          const selectedSignals = triageSignals.slice(0, 5);

          // ── Temporal Triangulation ──
          // Immediate: what is true right now
          const immediateSignal =
            (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90)
              ? `${nextHighStakesEvent.title} in ${nextHighStakesEvent.minutesUntil} mins`
            : divergenceMode === 'MASKED_HIGH'
              ? `Body showing load not yet registered (HRV ${hrvDeviation ?? '?'}%)`
            : safeTier === 'depleted'
              ? `Depleted state — score ${innerReadinessScore}/100`
            : checkInOutcome
              ? `${checkInOutcome} state today`
            : null;

          // Tactical: what patterns say
          const tacticalSignal =
            hrvEventCorrelation
              ? hrvEventCorrelation
            : consecutiveLowDays >= 3
              ? `${consecutiveLowDays} consecutive ${safeTier} days`
            : (scoreVsTypicalDOW && scoreVsTypicalDOW !== 'consistent' && typicalDOWOutcome)
              ? `${scoreVsTypicalDOW} than typical ${dayName} (usually ${typicalDOWOutcome})`
            : (frictionTrend === 'declining')
              ? `Friction declining over 30 days`
            : (scoreTrajectory7d === 'declining' && avgScore7d != null)
              ? `Score declining this week — avg ${avgScore7d}/100`
            : null;

          // Strategic: what development goals say
          const strategicSignal =
            pendingCommitment
              ? `Pending coach commitment: ${pendingCommitment}`
            : coachGrowth
              ? `Coach growth area: ${coachGrowth}`
            : (leanOnResult.watchFor)
              ? `Archetype watch for: ${leanOnResult.watchFor}`
            : null;

          // Cross-horizon connection
          let crossHorizonConnection: string | null = null;
          let connectionFraming = '';
          let dominantHorizon: 'immediate' | 'tactical' | 'strategic' = 'immediate';

          if (immediateSignal && tacticalSignal && strategicSignal) {
            crossHorizonConnection = 'immediate_tactical_strategic';
            connectionFraming = 'All three horizons align — this is the most powerful brief. Be specific.';
            dominantHorizon = 'tactical';
          } else if (immediateSignal && tacticalSignal) {
            crossHorizonConnection = 'immediate_confirms_tactical';
            connectionFraming = 'Today is confirming a pattern — connect the two explicitly.';
            dominantHorizon = 'tactical';
          } else if (tacticalSignal && strategicSignal) {
            crossHorizonConnection = 'tactical_connects_strategic';
            connectionFraming = 'The pattern connects to their development goal — make that connection visible.';
            dominantHorizon = 'strategic';
          } else if (immediateSignal && strategicSignal) {
            crossHorizonConnection = 'immediate_activates_strategic';
            connectionFraming = "Today's state activates their development area — connect them.";
            dominantHorizon = 'strategic';
          }

          // Override: JIT < 90 always immediate
          if (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90) dominantHorizon = 'immediate';

          // ── Context Frame ──
          const contextFrame =
            isSundayEvening2 ? 'Preparing for the week ahead. Write forward, not reflective.'
            : isDayBeforeRestDay ? 'Heading into rest. Frame as closure and release.'
            : isMondayMorning ? 'Week is being set right now. Frame as intentional and forward.'
            : null;

          // ── System Prompt (short, focused) ──
          const systemPrompt = `You are a performance intelligence system briefing a C-suite leader.
Voice: trusted chief of staff. Precise. Never generic. Never fluffy.

Produce two things:
1. PHRASE: 3-6 words. Crisp directive earned by their data.
2. BODY: One sentence, max 15 words. **Bold** the key action.

Core rule: if triangulation data is provided, the body MUST connect at least two time horizons — what is true now AND what pattern or goal this connects to. This is what makes the brief feel like it knows the leader.

Rules (no exceptions):
- Reference at least one specific signal provided
- No wellness words ever: relax, mindful, breathe, calm, wellness, self-care, journey, practice, routine, nourish, recharge
- No affirmations, no softening, no encouragement
- C-suite register only: direct, precise, data-referenced
- Wearable data > felt state when they diverge
- Never say "readiness"
- Never repeat the phrase in the body
- JIT event within 90 mins: orient entirely around it
- If calendar load is 'none': do not reference meetings or scheduling
- If signals are insufficient for specificity: output null

Output ONLY valid JSON: {"phrase": "...", "bodyText": "..."}`;

          // ── User Prompt (dynamically assembled, zero NULLs) ──
          let userPrompt = `${safeTier} · ${innerReadinessScore}/100 · ${timeOfDayStr} · ${dayName}`;

          if (contextFrame) {
            userPrompt += `\n\nContext: ${contextFrame}`;
          }

          if (selectedSignals.length > 0) {
            userPrompt += `\n\nKey signals for today:\n${selectedSignals.join('\n')}`;
          }

          if (crossHorizonConnection) {
            userPrompt += `\n\nTriangulation:`;
            if (immediateSignal) userPrompt += `\n  Now: ${immediateSignal}`;
            if (tacticalSignal) userPrompt += `\n  Pattern: ${tacticalSignal}`;
            if (strategicSignal) userPrompt += `\n  Development: ${strategicSignal}`;
            userPrompt += `\n  Connection: ${crossHorizonConnection} — ${connectionFraming}`;
            userPrompt += `\n  Lead with: ${dominantHorizon}`;
          }

          if (coachStrength) {
            userPrompt += `\n\nTheir strength (from coach): ${coachStrength}`;
          }

          if (serverArchetype) {
            userPrompt += `\n\nArchetype: ${serverArchetype}`;
            if (leanOnResult.leanOn) userPrompt += ` — lean on ${leanOnResult.leanOn}`;
            if (leanOnResult.watchFor) userPrompt += `, watch for ${leanOnResult.watchFor}`;
          }

          // ── Call LLM ──
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);

          const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content?.trim();
            if (content) {
              try {
                let jsonStr = content;
                if (jsonStr.startsWith('```')) {
                  jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                }
                const parsed = JSON.parse(jsonStr);
                if (parsed.phrase && parsed.phrase !== 'null') llmPhrase = parsed.phrase;
                if (parsed.bodyText && parsed.bodyText !== 'null') llmBodyText = parsed.bodyText;
              } catch (parseErr) {
                console.error('[compute-outer-readiness] LLM JSON parse error:', parseErr);
              }
            }
          } else {
            console.error('[compute-outer-readiness] LLM error:', aiRes.status);
          }
        }
      } catch (llmErr) {
        console.error('[compute-outer-readiness] LLM synthesis error:', llmErr);
      }
    }

    console.log(`[compute-outer-readiness] DRB phrase source: ${llmPhrase ? 'llm' : 'template'}`);
    console.log(`[compute-outer-readiness] DRB body source: ${llmBodyText ? 'llm' : 'template'}`);

    // Map leanOn source to human-readable label
    const sourceMap: Record<string, string> = {
      'coach-insights-recent': 'coach-insights-recent',
      'coach-insights-grace': 'coach-insights-grace',
      'cc-modifier': 'cc-modifier',
      'cc-modifier-with-context': 'cc-modifier-with-context',
      'coach-partial-strength': 'coach-partial-strength',
      'coach-partial-growth': 'coach-partial-growth',
      'archetype-tier': 'archetype-tier',
      'tier-fallback': 'tier-fallback',
      'sunday-evening-override': 'sunday-evening-override',
      'evening-recovery-override': 'evening-recovery-override',
    };

    const result: OuterReadinessResult & Record<string, unknown> = {
      phrase: llmPhrase || finalPhrase,
      context: finalContext,
      leanOn: leanOnResult.leanOn,
      watchFor: leanOnResult.watchFor,
      driver: theme.driver,
      dataSources,
      calendarState: calendarResult.state,
      coachInsightAge: leanOnResult.coachInsightAge,
      coachInsightLabel: leanOnResult.coachInsightLabel,
      stateStatement,
      stateAlreadyUsed,
      compassAlreadyUsed,
      // DecisionReadinessBrief fields
      bodyText: llmBodyText || null,
      leanOnSource: leanOnResult.source,
      watchForSource: leanOnResult.source,
      hasWearable,
      wearableDaysConnected,
      hrvDeviation,
      sleepDeviation,
      rhrDeviation,
      sleepDuration,
      rhrValue,
      sleepScore: sleepScoreVal,
      hrvValue,
      hrvBaseline,
      sleepBaseline,
      rhrBaseline,
      wearableDataSource,
      hasHistoricalData,
      hasCalendar: hasCal,
      calendarLoad: calendarLoad || 'low',
      meetingCount: calendarResult.meetingCount,
      highStakesEvents: todayHighStakes,
      nextHighStakesEvent,
      checkInCountTotal,
      consecutiveLowConfidence,
      coachStrength,
      clarityLevel: clarityLevel,
      confidenceLevel: confidenceLevel,
      // New enrichment fields
      yesterdayScore,
      scoreTrend,
      hasBackToBack,
      longestBackToBackHrs,
      nextEvent: nextEventAny,
      practicesCompletedThisWeek,
      practiceCompletionRate,
      daysSinceCoachSession,
      coachSessionImpactDelta,
      avgScore7d,
      scoreTrajectory7d,
      wearableTrend7d,
      typicalDOWScore,
      divergenceMode,
      weekAheadShape,
      hrvEventCorrelation,
      mostEffectivePractice,
    };

    console.log('[compute-outer-readiness] RESULT:', JSON.stringify({
      phrase: finalPhrase,
      driver: theme.driver,
      source: leanOnResult.source,
      coachInsightAge: leanOnResult.coachInsightAge,
      dataSources,
      calendarState: calendarResult.state,
      todayHighStakes,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[compute-outer-readiness] Error:', msg);
    const status = msg === 'Invalid token' || msg === 'Missing authorization header' ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
