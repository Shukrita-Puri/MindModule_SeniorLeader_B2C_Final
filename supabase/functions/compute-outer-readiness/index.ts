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
}

// ==================== SERVER-SIDE CALENDAR METRICS ====================
interface CalendarMetricsResult {
  load: CalendarLevel;
  pressure: CalendarLevel;
  eventCount: number;
  state: 'active' | 'connected_no_events' | 'not_connected';
  highStakesEvents: string[];
  remainingEvents: number;
  remainingHighStakes: string[];
}

interface WearableContext {
  hrv: number | null;
  rhr: number | null;
  peakHR: number | null;
  sleepScore: number | null;
  sleepDuration: number | null;
  hrvElevated: boolean; // HRV significantly below baseline
  hrElevated: boolean;  // Peak HR notably high (>100 or >120% of RHR)
  poorSleep: boolean;   // sleep_score < 60 or sleep_duration < 360 min (6h)
  rhrElevated: boolean; // RHR > 75bpm — resting heart rate above baseline
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

  // Load — density-aware thresholds
  let load: CalendarLevel = 'low';
  if (count >= 5) load = 'high';
  else if (count >= 4 && avgGap < 20) load = 'high';
  else if (count >= 3) load = 'medium';

  // Pressure — weighted scoring
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
    return { load: 'low', pressure: 'low', eventCount: 0, state: 'not_connected', highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [] };
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
    // All-day events (>4h with ≤1 attendee) are NOT high-stakes — they're calendar blockers.
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

      // Skip all-day or very long events (>4h) with few attendees — calendar blockers, not meetings
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

    return { ...metrics, eventCount: eventList.length, state: 'active', highStakesEvents, remainingEvents, remainingHighStakes };
  }

  return { load: 'low', pressure: 'low', eventCount: 0, state: 'connected_no_events', highStakesEvents: [], remainingEvents: 0, remainingHighStakes: [] };
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

  // ── EVENING: Retrospective framing — acknowledge what was carried, not what to pace ──
  if (isEvening) {
    if (hasStakes && bodyStrained) {
      const stakeRef = todayHighStakes!.length === 1 ? todayHighStakes![0] : `${todayHighStakes![0]} and ${todayHighStakes![1]}`;
      return ` You carried ${stakeRef} today while your body ran at elevated strain throughout.`;
    }
    if (hasStakes && denseCalendar) {
      const stakeRef = todayHighStakes![0];
      return ` You navigated ${stakeRef} and a full calendar today.`;
    }
    if (denseCalendar && bodyStrained) {
      return ` ${eventCount} meetings today, and your heart rate reflected the density throughout.`;
    }
    if (denseCalendar) {
      return ` You navigated a dense calendar today — ${eventCount} meetings.`;
    }
    if (bodyStrained) {
      return ' Your body is carrying accumulated strain — the day is done and recovery matters now.';
    }
    if (hasSleepIssue) {
      return ' You started today under-recovered and carried that through a full day.';
    }
    return '';
  }

  // ── MORNING / AFTERNOON: Forward-looking framing ──

  // When high-stakes events AND body strain — connect the two signals
  if (hasStakes && bodyStrained) {
    const stakeRef = todayHighStakes!.length === 1 ? todayHighStakes![0] : `${todayHighStakes![0]} and ${todayHighStakes![1]}`;
    return ` A day anchored by ${stakeRef} while your body carried elevated strain throughout.`;
  }

  // High-stakes events AND poor sleep (morning) — connect recovery to demands
  if (hasStakes && timeOfDay === 'morning' && hasSleepIssue) {
    const stakeRef = todayHighStakes!.length === 1 ? todayHighStakes![0] : `${todayHighStakes![0]} and ${todayHighStakes![1]}`;
    const sleepDetail = wearable!.sleepScore ? `(sleep score: ${wearable!.sleepScore})` : '';
    return ` Recovery overnight was incomplete ${sleepDetail} — and ${stakeRef} is ahead.`;
  }

  // High-stakes events, load is also high, body is fine — characterize the day
  if (hasStakes && denseCalendar) {
    const stakeRef = todayHighStakes![0];
    return ` Your most demanding conditions today, anchored by ${stakeRef}.`;
  }

  // Dense calendar + body strain — connect density to physical signal
  if (denseCalendar && bodyStrained) {
    return ` ${eventCount} meetings with tight gaps, and your heart rate reflected the density.`;
  }

  // Dense calendar, no strain — note the volume (morning/afternoon only)
  if (denseCalendar) {
    return ` ${eventCount} meetings today — pace the gaps.`;
  }

  // Body strain only, light calendar — accumulated strain signal
  if (bodyStrained && (!eventCount || eventCount < 3)) {
    return ' Your body is carrying more than your calendar suggests — accumulated strain from recent days.';
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
    return ' Your resting heart rate is running above baseline — your system didn\'t fully reset overnight.';
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
    parts.push(`${eventCount} meetings today — pace the remaining hours deliberately.`);
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
): { phrase: string; context: string; driver: ThemeDriver } {
  const hasTomorrowStakes = tomorrowHighStakes && tomorrowHighStakes.length > 0;
  const tomorrowEvent = hasTomorrowStakes ? tomorrowHighStakes[0] : null;
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);
  const hadHeavyDay = calendarLoad === 'high' || calendarPressure === 'high';
  const hasTodayStakes = todayHighStakes && todayHighStakes.length > 0;
  const todayDense = eventCount && eventCount >= 4;
  const remaining = remainingEvents ?? 0;
  const pastEvents = (eventCount ?? 0) - remaining;
  const hasRemainingHS = remainingHighStakes && remainingHighStakes.length > 0;

  // Sleep acknowledgment for evening
  const sleepNote = wearable?.poorSleep
    ? ' You started today under-recovered and carried that through a full day. Tonight\'s sleep matters more than usual.'
    : '';

  // RHR note for evening
  const rhrNote = wearable?.rhrElevated && !bodyStressed
    ? ' Your resting heart rate is still elevated — tonight\'s recovery is especially important.'
    : '';

  // ══════════════════════════════════════════════════════════════
  // BRANCH A: Events still ahead (remainingEvents > 0)
  // Acknowledge past + frame remaining — day is NOT done
  // ══════════════════════════════════════════════════════════════
  if (remaining > 0) {
    // A-1: Remaining high-stakes events ahead
    if (hasRemainingHS) {
      if (tier === 'depleted') {
        return {
          phrase: "Protect what's left.",
          context: `You've spent most of today's reserves across ${pastEvents} meeting${pastEvents !== 1 ? 's' : ''}. With ${remainingHighStakes![0]} still ahead, protect what's left for the moment that matters.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      if (tier === 'managing') {
        return {
          phrase: "Stay present for what's left.",
          context: `You've navigated ${pastEvents} meeting${pastEvents !== 1 ? 's' : ''} today. With ${remainingHighStakes![0]} still ahead, your decision readiness continues to matter — stay present for what's left.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      if (tier === 'strong') {
        return {
          phrase: "Carry your edge forward.",
          context: `You've navigated ${pastEvents} meeting${pastEvents !== 1 ? 's' : ''} today with above-baseline readiness. ${remainingHighStakes![0]} is still ahead — your advantage is genuine, deploy it where it counts.${sleepNote}${rhrNote}`,
          driver: 'evening',
        };
      }
      // peak
      return {
        phrase: "Finish at your best.",
        context: `${pastEvents} meeting${pastEvents !== 1 ? 's' : ''} navigated at peak readiness. ${remainingHighStakes![0]} is still ahead — this state is rare, use it fully for what remains.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }

    // A-2: Remaining events but not high-stakes + body strain
    if (bodyStressed) {
      return {
        phrase: "Pace the remaining hours.",
        context: `You've carried strain through ${pastEvents} meeting${pastEvents !== 1 ? 's' : ''} already. With ${remaining} still ahead, pace the remaining hours deliberately.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }

    // A-3: Remaining events, no strain, no high-stakes
    return {
      phrase: defaultPhrase || "Stay steady.",
      context: `You've navigated ${pastEvents} meeting${pastEvents !== 1 ? 's' : ''} so far. ${remaining} still ahead — the day isn't done, but the hardest part may be behind you.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ══════════════════════════════════════════════════════════════
  // BRANCH B: Day is done (remainingEvents === 0)
  // Full retrospective + tomorrow as recovery motivation
  // ══════════════════════════════════════════════════════════════

  // ── Build todaySummary: acknowledge what the user carried today ──
  let todaySummary = '';
  if (hadHeavyDay && bodyStressed && hasTodayStakes) {
    todaySummary = `You carried a demanding day — ${todayHighStakes!.length >= 2 ? `${todayHighStakes!.length} high-stakes meetings` : todayHighStakes![0]} with your heart rate elevated throughout.`;
  } else if (hadHeavyDay && hasTodayStakes) {
    todaySummary = `You navigated ${todayHighStakes![0]} and a full calendar today.`;
  } else if (hadHeavyDay && todayDense) {
    todaySummary = `You navigated a dense calendar — ${eventCount} meetings with tight gaps.`;
  } else if (bodyStressed) {
    todaySummary = wearable!.hrElevated
      ? "Your heart rate ran high through today's demands."
      : "Your HRV is showing accumulated strain from today.";
  } else if (hadHeavyDay) {
    todaySummary = 'You carried a full day of demands.';
  } else if (todayDense) {
    todaySummary = `You navigated ${eventCount} meetings today.`;
  }

  // ── Priority 1: Today was heavy + Tomorrow has high-stakes ──
  if (todaySummary && hasTomorrowStakes) {
    if (tier === 'depleted' || tier === 'managing') {
      return {
        phrase: "Ground before tomorrow.",
        context: `${todaySummary} Tomorrow has ${tomorrowEvent}. What you release tonight determines how sharp you arrive — restoration, not preparation.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    return {
      phrase: "Restore for what matters.",
      context: `${todaySummary} ${tomorrowEvent} is tomorrow. Your body needs genuine recovery tonight — you'll arrive sharper rested than over-rehearsed.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 2: Today was heavy, no tomorrow stakes ──
  if (todaySummary && bodyStressed) {
    return {
      phrase: defaultPhrase || "Let the body close.",
      context: `${todaySummary} The cool-down tonight is physical, not just mental — what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 3: Light today + heavy tomorrow ──
  if (!hadHeavyDay && hasTomorrowStakes) {
    if (tier === 'depleted') {
      return {
        phrase: "Ground before tomorrow.",
        context: `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. The recovery window tonight is genuine — use it. Your reserves are low and tomorrow will ask for them.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    return {
      phrase: "Arrive at your best.",
      context: `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. The recovery window tonight is genuine — restoration now determines how you arrive.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 4: Tomorrow has high-stakes (body fine, today unremarkable) ──
  if (hasTomorrowStakes) {
    if (tier === 'depleted') {
      return {
        phrase: "Ground before tomorrow.",
        context: `You have ${tomorrowEvent} tomorrow and your reserves are low. Tonight is about arriving restored, not prepared. What you protect now directly shapes how you show up.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Close with tomorrow in mind.",
        context: `${tomorrowEvent} is tomorrow. A clean close tonight is the best preparation — you'll show up sharper by resting well than by rehearsing late.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Protect your edge for tomorrow.",
        context: `You have ${tomorrowEvent} tomorrow and above-baseline readiness to carry into it. The highest-leverage move tonight is a deliberate wind-down, not preparation.${sleepNote}${rhrNote}`,
        driver: 'evening',
      };
    }
    // peak
    return {
      phrase: "Arrive at your best.",
      context: `${tomorrowEvent} is tomorrow and your readiness is at its peak. Your only priority tonight is protecting this state through genuine rest.${sleepNote}${rhrNote}`,
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
      context: `${bodySignal}. The cool-down tonight is physical, not just mental — what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // ── Priority 6: Today acknowledgment without strain ──
  if (todaySummary) {
    return {
      phrase: defaultPhrase || "Close before tomorrow.",
      context: `${todaySummary} Tonight is about release, not review.${sleepNote}${rhrNote}`,
      driver: 'evening',
    };
  }

  // Default: soft close
  let ctx = defaultContext || "Tonight is about release, not review.";
  if (sleepNote) ctx += sleepNote;
  if (rhrNote) ctx += rhrNote;
  return { phrase: defaultPhrase || "Close before tomorrow.", context: ctx, driver: 'evening' };
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
    ? todayHighStakes!.length === 1 ? todayHighStakes![0] : `${todayHighStakes![0]} and ${todayHighStakes![1]}`
    : null;

  // RHR morning note (added to relevant contexts)
  const rhrMorningNote = wearable?.rhrElevated
    ? ' Your resting heart rate is running above baseline — your system didn\'t fully reset overnight.'
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
        context: `Recovery overnight was incomplete ${sleepDetail}, and you have ${eventRef} today. Your system is starting in deficit — pace the opening and deploy carefully where it counts.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Start steady, not strong.",
        context: `Recovery overnight was incomplete ${sleepDetail}, and ${eventRef} is ahead. Your operating baseline is lower than usual — a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Guard the morning window.",
        context: `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. With ${eventRef} ahead, that advantage is more fragile than usual — protect it through the morning's first demands.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context: `Peak readiness despite a shorter recovery window ${sleepDetail}. ${eventRef} is ahead — this state may not sustain through a full day. Deploy it where it matters most, not where it's spent first.${rhrMorningNote}`,
      driver: 'morning',
    };
  }

  // Priority 2: Good recovery + high-stakes events today
  if (hasHighStakes && wearable && !wearable.poorSleep && !wearable.hrvElevated) {
    if (tier === 'depleted') {
      return {
        phrase: "Pace from the start.",
        context: `${eventRef} is ahead today and your reserves are low despite adequate rest. Every early commitment costs more — protect your capacity for the moments that matter.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Set a sustainable pace.",
        context: `Adequate recovery and ${eventRef} ahead. Your operating baseline is solid enough — a steady opening protects the capacity you'll need later.${rhrMorningNote}`,
        driver: 'morning',
      };
    }
    // strong/peak
    return {
      phrase: tier === 'peak' ? "Protect the peak." : "Protect the window.",
      context: `Well-recovered and ${eventRef} is ahead. Your readiness is genuine — protect it through the morning's first demands.${rhrMorningNote}`,
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
      ? ` ${eventCount} meetings today — pace through the volume deliberately.`
      : '';
    if (tier === 'depleted') {
      return {
        phrase: "Pace from the start.",
        context: `Recovery overnight was incomplete ${sleepDetail}. Your system is starting in deficit — every early commitment costs more today. Protect the first hours and deploy carefully.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'managing') {
      return {
        phrase: "Start steady, not strong.",
        context: `Recovery overnight was incomplete ${sleepDetail}. Your operating baseline is lower than usual — a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    if (tier === 'strong') {
      return {
        phrase: "Guard the morning window.",
        context: `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. That advantage is more fragile than usual — protect it through the morning's first demands.${rhrMorningNote}${densityNote}`,
        driver: 'morning',
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context: `Peak readiness despite a shorter recovery window ${sleepDetail}. This state may not sustain through a full day — deploy it where it matters most, not where it's spent first.${rhrMorningNote}${densityNote}`,
      driver: 'morning',
    };
  }

  // Priority 4: HRV elevated strain (no poor sleep)
  if (wearable?.hrvElevated) {
    const calendarNote = hasHighStakes
      ? ` ${eventRef} is ahead — pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead — pace through the volume.`
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
      ? ` ${eventRef} is ahead — pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead — pace through the volume.`
      : '';
    return {
      phrase: defaultPhrase || "Ease into the day.",
      context: `Your resting heart rate is running above baseline — your system didn't fully reset overnight. ${defaultContext || "How you pace the opening hours determines your capacity through the rest of the day."}${calendarNote}`,
      driver: 'morning',
    };
  }

  // Priority 5: High-stakes events but no wearable data
  if (hasHighStakes) {
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: `${eventRef} is ahead today. ${defaultContext || "The opening of the day sets the tone for everything that follows."}`,
      driver: 'morning',
    };
  }

  // Priority 6: Dense calendar but no wearable / no stakes
  if (eventCount && eventCount >= 4) {
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: `${eventCount} meetings today. ${defaultContext || "The opening of the day sets the tone for everything that follows."}`,
      driver: 'morning',
    };
  }

  return { phrase: defaultPhrase || "Start with presence.", context: defaultContext || "The opening of the day sets the tone for everything that follows.", driver: 'morning' };
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
): { phrase: string; context: string; driver: ThemeDriver } {
  
  if (pressure === null || load === null) {
    return getNoCalendarTheme(tier, score, hour, dayOfWeek, wearable, todayHighStakes, eventCount, remainingEvents, remainingHighStakes);
  }

  const timeOfDay = getTimeOfDay(hour);
  const dayCtx = getDayContext(dayOfWeek);

  // Build dynamic context suffix for all tier×load×pressure entries
  const suffix = buildContextSuffix(todayHighStakes, eventCount, wearable, timeOfDay);

  // DEPLETED TIER
  if (tier === 'depleted') {
    // Evening FIRST — always route to retrospective logic
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
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes);
    }
    // Morning
    if (timeOfDay === 'morning')
      return buildMorningTheme('depleted', wearable, "Begin with intention.", "Starting the day in a depleted state with demands ahead. How you enter each moment today matters more than how much you do.", todayHighStakes, eventCount);
    // Afternoon
    if (timeOfDay === 'afternoon') {
      const base = "Starting the day in a depleted state with demands ahead. How you enter each moment today matters more than how much you do.";
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
    return { phrase: "Protect your reserves.", context: "The demands ahead need to be met with what you have. Deliberate pacing is your strategy today." + suffix, driver: 'state' };
  }

  // MANAGING TIER
  if (tier === 'managing') {
    // Evening FIRST
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday') {
        const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
        const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead. How you close tonight is how you open the week — a clean transition here protects your capacity for tomorrow's first high-stakes moments."
          : lightMon
          ? "A lighter Monday ahead. A clean close tonight means you can open the week with intention rather than inertia."
          : "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.";
        return { phrase: "Close into the week.", context: ctx, driver: 'evening' };
      }
      if (dayCtx === 'friday')
        return { phrase: "Let the week go.", context: "You've carried the week at operating capacity. The weekend is a genuine recovery window if you let the work threads close.", driver: 'evening' };
      return buildWeekdayEveningTheme('managing', tomorrowHighStakes, wearable,
        "Close with care.", "You've carried the day's demands at operating capacity. How you close is how you recover.",
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes);
    }
    // Morning
    if (timeOfDay === 'morning')
      return buildMorningTheme('managing', wearable, "Set a sustainable pace.", "The full shape of the day is ahead. How you pace the opening determines whether you finish well.", todayHighStakes, eventCount);
    // Afternoon
    if (timeOfDay === 'afternoon') {
      const base = "The full shape of the day is ahead. How you pace the remaining hours determines whether you finish well.";
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
        todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes);
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

  // PEAK TIER — evening FIRST
  if (timeOfDay === 'evening') {
    if (dayCtx === 'sunday') {
      const heavyMon = tomorrowLoad === 'high' || tomorrowPressure === 'high';
      const lightMon = tomorrowLoad === 'low' && (tomorrowPressure === 'low' || tomorrowPressure === null);
      const ctx = heavyMon
        ? "Full readiness before a demanding Monday is exceptionally rare and valuable. Your only priority tonight is protecting this state through genuine rest."
        : lightMon
        ? "A lighter Monday ahead and peak readiness to carry into it. Protect this state — the week could open at your absolute best."
        : "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.";
      return { phrase: "Protect it for Monday.", context: ctx, driver: 'evening' };
    }
    if (dayCtx === 'friday')
      return { phrase: "Close at the peak.", context: "Peak readiness at week's end. A deliberate close tonight protects this state into the weekend.", driver: 'evening' };
    return buildWeekdayEveningTheme('peak', tomorrowHighStakes, wearable,
      "Close with intention.", "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.",
      todayHighStakes, eventCount, load, pressure, remainingEvents, remainingHighStakes);
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
    return { phrase: "Peak meets opportunity.", context: "Your strongest readiness and the space to use it fully. A rare condition — deploy on what genuinely matters most to you." + suffix, driver: 'pressure' };
  if (pressure === 'medium' && load === 'high')
    return { phrase: "Flow through the day.", context: "A full calendar with your strongest capacity. Conditions for effortless passage through complex demands." + suffix, driver: 'load' };
  if (load === 'high' && pressure === 'low')
    return { phrase: "Effortless volume.", context: "High volume at peak readiness. The rare day where a full schedule doesn't need careful management." + suffix, driver: 'load' };
  if (load === 'medium')
    return { phrase: "Choose your investments.", context: "Full readiness on a selective day. The question is not what you can handle, but what deserves this state of readiness." + suffix, driver: 'load' };
  if (load === 'low')
    return { phrase: "Rare conditions.", context: "Peak readiness and an open schedule. The rarest combination — conditions for the thinking or decisions you've been waiting for." + suffix, driver: 'load' };
  return { phrase: "Own your optimal state.", context: "Full readiness is present. The priority is protecting that state through the full shape of what the day holds." + suffix, driver: 'state' };
}

// ==================== NO-CALENDAR FALLBACKS (sub-tier + time-aware) ====================
function getNoCalendarTheme(tier: EnergyTier, score: number, hour: number, dayOfWeek: number, wearable?: WearableContext | null, todayHighStakes?: string[], eventCount?: number, remainingEvents?: number, remainingHighStakes?: string[]): { phrase: string; context: string; driver: ThemeDriver } {
  const dayCtx = getDayContext(dayOfWeek);
  const lateEvening = isLateEvening(hour);
  const timeOfDay = getTimeOfDay(hour);
  const bodyStressed = wearable && (wearable.hrElevated || wearable.hrvElevated);

  // Build wearable-only suffix for no-calendar contexts
  const wearableSuffix = wearable
    ? (timeOfDay === 'morning' && wearable.poorSleep
      ? ` Your recovery overnight was incomplete${wearable.sleepScore ? ` (sleep score: ${wearable.sleepScore})` : ''}.${wearable.rhrElevated ? ' Your resting heart rate is running above baseline.' : ''}`
      : timeOfDay === 'morning' && wearable.rhrElevated
      ? ' Your resting heart rate is running above baseline — your system didn\'t fully reset overnight.'
      : wearable.hrElevated
      ? ' Your heart rate ran high recently — your body is carrying accumulated strain.'
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
      const bodyNote = bodyStressed ? ` Your ${wearable!.hrElevated ? 'heart rate ran high' : 'HRV shows strain'} through today — the cool-down is physical, not just mental.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered and carried that through a full day. Tonight\'s sleep matters more than usual.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated — tonight\'s recovery is especially important.' : '';
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
    // Non-late evening (18:00-20:59) — route to weekday evening theme
    if (timeOfDay === 'evening')
      return buildWeekdayEveningTheme('depleted', null, wearable,
        "Close before tomorrow.", "What you don't release tonight you carry into tomorrow's first decisions and interactions.",
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes);
    if (score <= 25)
      return { phrase: "Begin with stillness.", context: "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual." + wearableSuffix, driver: 'state' };
    return { phrase: "Protect your reserves.", context: "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now." + wearableSuffix, driver: 'state' };
  }
  if (tier === 'managing') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Close into the week.", context: "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.", driver: 'state' };
      const bodyNote = bodyStressed ? ` Your body is also signalling strain — a deliberate physical wind-down tonight supports tomorrow's recovery.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered — tonight\'s sleep quality matters more than usual.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated — tonight\'s recovery is especially important.' : '';
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
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes);
    if (score <= 49)
      return { phrase: "Operate with care.", context: "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment." + wearableSuffix, driver: 'state' };
    return { phrase: "Steady and selective.", context: "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes." + wearableSuffix, driver: 'state' };
  }
  if (tier === 'strong') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Carry it into Monday.", context: "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday.", driver: 'state' };
      const bodyNote = bodyStressed ? ` Despite above-baseline readiness, your ${wearable!.hrElevated ? 'heart rate' : 'HRV'} is signalling the body needs recovery — honour that tonight.` : '';
      const sleepNote = wearable?.poorSleep ? ' You started today under-recovered — tonight\'s recovery window is especially valuable.' : '';
      const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated — tonight\'s recovery is especially important.' : '';
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
        todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes);
    if (score <= 69)
      return { phrase: "Lead with confidence.", context: "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you." + wearableSuffix, driver: 'state' };
    return { phrase: "Invest your advantage.", context: "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing." + wearableSuffix, driver: 'state' };
  }
  // Peak
  if (lateEvening) {
    if (dayCtx === 'sunday')
      return { phrase: "Protect it for Monday.", context: "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.", driver: 'state' };
    const bodyNote = bodyStressed ? ` Your body is telling a different story to your mind — honour the physical signal with a genuine wind-down.` : '';
    const sleepNote = wearable?.poorSleep ? ' You started today under-recovered — tonight\'s recovery window is especially valuable.' : '';
    const rhrNote = wearable?.rhrElevated && !bodyStressed ? ' Your resting heart rate is still elevated — tonight\'s recovery is especially important.' : '';
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
      todayHighStakes, eventCount, null, null, remainingEvents, remainingHighStakes);
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

  // Build wearable-aware leanOn suffix — crisp, no numbers
  const bodyLeanOnSuffix = bodyStressed
    ? ' Your body carried today\'s load — the cool-down tonight is physical, not just mental.'
    : '';

  // Build tomorrow-aware watchFor suffix — crisp, no event names
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
        ? "Your capacity to close a demanding day cleanly. You carried the weight — now let the day be done."
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

  // Wearable suffix for Sunday leanOn — crisp
  const bodySuffix = bodyStressed
    ? ' Your body is also signalling strain from this weekend. Tonight\'s recovery is physical too.'
    : '';

  // High-stakes Monday event reference (kept for Sunday as forward-look is primary)
  const stakeRef = monEvent ? ` You have ${monEvent} on Monday.` : '';

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
        ? `Your capacity to close the weekend cleanly.${stakeRef} A demanding Monday is ahead — how you enter it matters more than what you plan for it.`
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

// Clarity × Confidence modifier — now time-aware for evening retrospective framing
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

  // Pattern 1: Both low — rare, significant signal
  if (clarityLow && confidenceLow) {
    return isEvening
      ? {
          leanOn: "Your honesty about where you are. Ending a day with low clarity and low confidence is uncomfortable, but recognising it is itself leadership.",
          watchFor: "Trying to force resolution tonight when both your compass and conviction need rest, not pressure.",
        }
      : {
          leanOn: "Your honesty about where you are. Recognising that both clarity and confidence are low today is itself a form of self-leadership most people can't manage.",
          watchFor: "Making commitments or significant decisions while both your internal compass and your conviction are unsettled.",
        };
  }

  // Pattern 2: Both high — full alignment
  if (clarityHigh && confidenceHigh) {
    return isEvening
      ? {
          leanOn: "Your internal alignment. You operated with clear direction and confident execution today. Let the day close on that note — no review needed.",
          watchFor: "Replaying today's decisions to optimise what was already well-executed. Your alignment held — trust it and release.",
        }
      : {
          leanOn: "Your internal alignment. Clear direction with confident execution — rare conditions that deserve to be used fully.",
          watchFor: "Overriding others because your conviction is high. Alignment can become rigidity if you stop listening.",
        };
  }

  // Pattern 3: High clarity + low confidence — knows what, but doubts self
  if (clarityHigh && confidenceLow) {
    return isEvening
      ? {
          leanOn: "Your clarity held through a full day, even without confidence backing it. That directional sense is genuine — trust it tonight.",
          watchFor: "Replaying moments where confidence didn't match your clarity. The direction was right even when conviction lagged.",
        }
      : {
          leanOn: "Your clarity. You see the direction clearly even when confidence hasn't caught up yet.",
          watchFor: "Waiting for confidence to arrive before acting on what you already know is right.",
        };
  }

  // Pattern 4: Low clarity + high confidence — confident without direction
  if (clarityLow && confidenceHigh) {
    return isEvening
      ? {
          leanOn: "Your confidence carried you through today. Even without clear direction, your self-trust kept you moving.",
          watchFor: "Assuming tonight's reflection will manufacture the clarity that was absent today. Rest first — clarity often arrives after recovery.",
        }
      : {
          leanOn: "Your confidence. Trust in your ability to find the right direction once you stop and look.",
          watchFor: "Operating as if today's peak readiness is the norm. Protect it, don't spend it.",
        };
  }

  // Pattern 5: Low clarity only (mid confidence)
  if (clarityLow) {
    return isEvening
      ? {
          leanOn: "Your capacity to sit with unresolved direction. If clarity was elusive today, evening is not the time to force it. Clarity often arrives after rest.",
          watchFor: "Grinding through open questions tonight when your system needs to release, not resolve.",
        }
      : {
          leanOn: "Your capacity to ask the right question before committing to a direction.",
          watchFor: "Moving into the day's demands before you've found your anchor point.",
        };
  }

  // Pattern 6: Low confidence only (mid clarity)
  if (confidenceLow) {
    return isEvening
      ? {
          leanOn: "Your self-awareness. You carried uncertainty through today's demands — that honesty about your state is itself valuable.",
          watchFor: "Reviewing today's decisions through the lens of low confidence. The decisions are done — let them stand.",
        }
      : {
          leanOn: "Your self-awareness. You know you're operating with uncertainty today, and that honesty is itself a form of leadership.",
          watchFor: "Decisions performed from projected confidence rather than genuine conviction.",
        };
  }

  // Pattern 7: High clarity only (mid confidence)
  if (clarityHigh) {
    return isEvening
      ? {
          leanOn: "Your directional certainty. You held clarity through a full day. That same directional sense now tells you when to stop.",
          watchFor: "Replaying today's decisions to find flaws. Your clarity held — trust it and release.",
        }
      : {
          leanOn: "Your directional certainty. You know what matters today and why.",
          watchFor: "Clarity about your own view crowding out the perspectives you need.",
        };
  }

  // Pattern 8: High confidence only (mid clarity)
  if (confidenceHigh) {
    return isEvening
      ? {
          leanOn: "Your conviction. You backed yourself through today's demands. That conviction has done its work — release it.",
          watchFor: "Confidence that keeps running past the day's close. Your judgment served you well — let it rest.",
        }
      : {
          leanOn: "Your conviction. You trust your judgment today and can move with authority.",
          watchFor: "Confidence tipping into certainty that closes off important inputs.",
        };
  }

  // Mid-range on both — no modifier, fall through to archetype/tier
  return null;
}

// Priority 3: Archetype × Tier matrix
const archetypeMatrix: Record<string, Record<EnergyTier, { leanOn: string; watchFor: string }>> = {
  'grounded-leader': {
    depleted: { leanOn: "Your instinct to return to stillness. It restores you faster than most.", watchFor: "Absorbing the room's energy when your own reserves need protecting." },
    managing: { leanOn: "Your capacity to stay rooted when the pace around you accelerates.", watchFor: "Underestimating the quiet drain of holding steadiness for others." },
    strong: { leanOn: "Your natural stability. It's a leadership presence others orient around.", watchFor: "Staying in maintenance mode when your state supports something more." },
    peak: { leanOn: "Your grounded precision. Full presence with full capacity.", watchFor: "Tunnel focus that closes off peripheral awareness at the moment it matters." },
  },
  'resilient-performer': {
    depleted: { leanOn: "Your knowledge that recovery is part of performance, not a retreat from it.", watchFor: "Performing resilience instead of actually recovering." },
    managing: { leanOn: "Your baseline reliability. Showing up consistently is its own form of leadership.", watchFor: "Settling for operational when your performance instinct wants to push." },
    strong: { leanOn: "Your above-baseline capacity. A real performance window is available.", watchFor: "Burning the window early by going too hard before the high-stakes moments." },
    peak: { leanOn: "Your full competitive edge. This is your signature performance state.", watchFor: "Spending the peak too fast without protecting what carries you through the full day." },
  },
  'clear-thinker': {
    depleted: { leanOn: "Your ability to think simply when complexity costs too much. Straight lines today.", watchFor: "Over-processing when low energy needs economy of thought." },
    managing: { leanOn: "Your capacity to bring analytical clarity to what genuinely requires it.", watchFor: "Applying deep analysis to decisions that don't warrant the cognitive spend." },
    strong: { leanOn: "Your sharpest insights surface from a stable, well-resourced state. Conditions are good.", watchFor: "Staying in analysis past the point where the insight is already clear." },
    peak: { leanOn: "Your analytical precision at full cognitive capacity. Your highest-value thinking window.", watchFor: "Intellectual momentum that runs past the decision point and into complexity for its own sake." },
  },
  'intensity-driver': {
    depleted: { leanOn: "Your knowledge that genuine rest is what fuels your next surge, not pushing through.", watchFor: "Forcing intensity on empty. It produces noise rather than output." },
    managing: { leanOn: "Your drive, held in check. Directed intensity at operational capacity is still formidable.", watchFor: "Impatience with the pace your current state requires." },
    strong: { leanOn: "Your capacity to amplify from a stable base. Above-baseline intensity is powerful and sustainable.", watchFor: "Accelerating past the pace that keeps the full day's output high." },
    peak: { leanOn: "Your full-force capability. Focused intensity at peak readiness is your highest-performance state.", watchFor: "Opening at full intensity before the highest-leverage moments of the day." },
  },
  'adaptive-navigator': {
    depleted: { leanOn: "Your ability to read what a situation actually needs. Even in a depleted state your situational awareness is sharp.", watchFor: "Adapting to everyone else's demands when your own capacity is the priority." },
    managing: { leanOn: "Your flexibility. Meeting the day's variability without resistance.", watchFor: "Staying adaptive when the moment calls for a fixed position." },
    strong: { leanOn: "Your strategic read of the full field. You see the whole board clearly from this state.", watchFor: "Over-navigating what could be decided directly and cleanly." },
    peak: { leanOn: "Your strategic agility at full cognitive capacity. Your sharpest navigation state.", watchFor: "Complexity for its own sake when direct, decisive action is what the moment needs." },
  },
  // Legacy ID fallbacks
  'natural-regulator': {
    depleted: { leanOn: "Your instinct to return to stillness. It restores you faster than most.", watchFor: "Absorbing the room's energy when your own reserves need protecting." },
    managing: { leanOn: "Your capacity to stay rooted when the pace around you accelerates.", watchFor: "Underestimating the quiet drain of holding steadiness for others." },
    strong: { leanOn: "Your natural stability. It's a leadership presence others orient around.", watchFor: "Staying in maintenance mode when your state supports something more." },
    peak: { leanOn: "Your grounded precision. Full presence with full capacity.", watchFor: "Tunnel focus that closes off peripheral awareness at the moment it matters." },
  },
  'high-octane-performer': {
    depleted: { leanOn: "Your knowledge that recovery is part of performance, not a retreat from it.", watchFor: "Performing resilience instead of actually recovering." },
    managing: { leanOn: "Your baseline reliability. Showing up consistently is its own form of leadership.", watchFor: "Settling for operational when your performance instinct wants to push." },
    strong: { leanOn: "Your above-baseline capacity. A real performance window is available.", watchFor: "Burning the window early by going too hard before the high-stakes moments." },
    peak: { leanOn: "Your full competitive edge. This is your signature performance state.", watchFor: "Spending the peak too fast without protecting what carries you through the full day." },
  },
  'strategic-pauser': {
    depleted: { leanOn: "Your ability to think simply when complexity costs too much. Straight lines today.", watchFor: "Over-processing when low energy needs economy of thought." },
    managing: { leanOn: "Your capacity to bring analytical clarity to what genuinely requires it.", watchFor: "Applying deep analysis to decisions that don't warrant the cognitive spend." },
    strong: { leanOn: "Your sharpest insights surface from a stable, well-resourced state. Conditions are good.", watchFor: "Staying in analysis past the point where the insight is already clear." },
    peak: { leanOn: "Your analytical precision at full cognitive capacity. Your highest-value thinking window.", watchFor: "Intellectual momentum that runs past the decision point and into complexity for its own sake." },
  },
  'awareness-builder': {
    depleted: { leanOn: "Your knowledge that genuine rest is what fuels your next surge, not pushing through.", watchFor: "Forcing intensity on empty. It produces noise rather than output." },
    managing: { leanOn: "Your drive, held in check. Directed intensity at operational capacity is still formidable.", watchFor: "Impatience with the pace your current state requires." },
    strong: { leanOn: "Your capacity to amplify from a stable base. Above-baseline intensity is powerful and sustainable.", watchFor: "Accelerating past the pace that keeps the full day's output high." },
    peak: { leanOn: "Your full-force capability. Focused intensity at peak readiness is your highest-performance state.", watchFor: "Opening at full intensity before the highest-leverage moments of the day." },
  },
};

// Priority 5: Hardcoded tier fallbacks
const tierFallbacks: Record<EnergyTier, { leanOn: string; watchFor: string }> = {
  depleted: { leanOn: "Your awareness of your own state. Knowing you're depleted is itself a form of self-leadership.", watchFor: "Committing to demands that require more than your current state can sustain." },
  managing: { leanOn: "Your operational steadiness. Consistent presence is a form of strength.", watchFor: "Over-extending into territory that requires more than your current reserves." },
  strong: { leanOn: "Your above-baseline readiness. A real asset that is worth protecting through the day.", watchFor: "Diffusing strong capacity across too many demands rather than concentrating it." },
  peak: { leanOn: "Your full readiness. You are at your most resourced, present, and capable.", watchFor: "Treating peak state as the norm and spending it without protecting what sustains it." },
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
const ENABLE_WEARABLE_RECOVERY_TRIGGER = false;

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

// ==================== LEAN ON / WATCH FOR — PRIORITY CASCADE ====================
// Data source priority for LeanOn/WatchFor:
// 1. Coach conversations (strength/growth insights) — PERSONAL
// 2. Archetype (onboarding-derived behavioral profile) — PERSONAL
// 3. [Future] LinkedIn profile analysis — PERSONAL
// 4. [Future] LLM conversation data (Claude/ChatGPT patterns) — PERSONAL
// 5. Calendar + Wearable context — SITUATIONAL (layered as suffix, never standalone)
// 6. Tier fallback — GENERIC
//
// Rule: Personal sources always lead. Situational context enriches but never replaces.
// Suffixes must be crisp — no event titles, no metric numbers.

interface LeanOnWatchForResult {
  leanOn: string;
  watchFor: string;
  source: string;
  coachInsightAge?: number;
  coachInsightLabel?: string;
  recoveryDayTriggered?: boolean;
}

// Build context enrichment suffix for leanOn — crisp, no event titles, no HR numbers.
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
    if (bodyStrained && hasStakes) return ' A demanding day ahead is meeting that instinct — and your body is carrying strain into it.';
    if (bodyStrained) return ' Your body is carrying strain into today. That awareness is itself an advantage.';
    if (hasStakes) return ' Your readiness for today\'s demands is genuine.';
  }

  if (timeOfDay === 'afternoon') {
    if (bodyStrained) return ' The morning tested that capacity — the afternoon will too.';
    if (hasStakes) return ' The afternoon\'s demands are meeting that instinct.';
  }

  if (timeOfDay === 'evening') {
    const remaining = remainingEvents ?? 0;
    if (remaining > 0) {
      if (bodyStrained) return ' The day isn\'t done — that instinct still serves you, and your body is signalling to pace what\'s left.';
      return ' The day isn\'t done — that instinct still serves you.';
    }
    if (bodyStrained) return ' Today tested that capacity. Your body is signalling the day is done.';
    return ' Today tested that capacity. The day is done.';
  }

  return '';
}

// Build context enrichment suffix for watchFor — crisp, no event titles, no HR numbers.
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

  // ── P0a: Sunday evening (after 9pm on Sunday) — ALWAYS wins ──
  if (lateEvening && dayCtx === 'sunday') {
    return { ...getSundayEveningInsights(tier, calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext), source: 'sunday-evening-override' };
  }

  // ── P0b: Late evening weekdays/Saturday (after 9pm) — recovery ALWAYS takes priority ──
  if (lateEvening) {
    return { ...getEveningInsights(tier, calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext), source: 'evening-recovery-override' };
  }

  // ── P1a: Coach insights ≤3 days (recent) — no age label, enriched with context ──
  if (hasCoachBoth && coachTier === 'recent') {
    const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    return {
      leanOn: `Based on your recent coach conversation: ${coachStrength!}${leanOnSuffix}`,
      watchFor: `Based on your recent coach conversation: ${coachGrowth!}${watchForSuffix}`,
      source: 'coach-insights-recent',
      coachInsightAge: coachDaysOld,
    };
  }

  // ── P1b: Coach insights 4-7 days (grace) — use if no C×C contradiction, enriched ──
  if (hasCoachBoth && coachTier === 'grace') {
    const hasContradiction = detectCCContradiction(coachStrength!, coachGrowth!, clarity, confidence);
    if (!hasContradiction) {
      const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
      const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
      return {
        leanOn: `From your coach session ${coachDaysOld} days ago: ${coachStrength!}${leanOnSuffix}`,
        watchFor: `From your coach session ${coachDaysOld} days ago: ${coachGrowth!}${watchForSuffix}`,
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
      const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
      const enrichedLeanOn = `${ccMod.leanOn}\n\n_Last time you spoke to the coach (${coachDaysOld} days ago), you identified: "${coachStrength}"_${leanOnSuffix}`;
      return {
        leanOn: enrichedLeanOn,
        watchFor: ccMod.watchFor + (hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : ''),
        source: 'cc-modifier-with-context',
        coachInsightAge: coachDaysOld,
        coachInsightLabel: `Last time you spoke to the coach (${coachDaysOld} days ago)`,
      };
    }
    const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    return { leanOn: `Based on your check-in today: ${ccMod.leanOn}${leanOnSuffix}`, watchFor: `Based on your check-in today: ${ccMod.watchFor}${watchForSuffix}`, source: 'cc-modifier' };
  }

  // ── Partial coach: mix with other priorities (any non-archived tier) ──
  if (coachStrength && !coachGrowth && coachTier !== 'historical' && coachTier !== 'archived') {
    const watchFor = archetypeMatrix[archetype || '']?.[tier]?.watchFor || tierFallbacks[tier].watchFor;
    const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchSource = archetypeMatrix[archetype || '']?.[tier] ? 'Based on your archetype profile: ' : '';
    return { leanOn: `From your coach conversation: ${coachStrength}${leanOnSuffix}`, watchFor: `${watchSource}${watchFor}${watchForSuffix}`, source: 'coach-partial-strength', coachInsightAge: coachDaysOld };
  }
  if (coachGrowth && !coachStrength && coachTier !== 'historical' && coachTier !== 'archived') {
    const leanOn = archetypeMatrix[archetype || '']?.[tier]?.leanOn || tierFallbacks[tier].leanOn;
    const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const leanSource = archetypeMatrix[archetype || '']?.[tier] ? 'Based on your archetype profile: ' : '';
    return { leanOn: `${leanSource}${leanOn}${leanOnSuffix}`, watchFor: `From your coach conversation: ${coachGrowth}${watchForSuffix}`, source: 'coach-partial-growth', coachInsightAge: coachDaysOld };
  }

  // ── P4: Archetype × Tier — enriched with context ──
  if (archetype && archetypeMatrix[archetype]?.[tier]) {
    const base = archetypeMatrix[archetype][tier];
    const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
    return { leanOn: `Based on your archetype profile: ${base.leanOn}${leanOnSuffix}`, watchFor: `Based on your archetype profile: ${base.watchFor}${watchForSuffix}`, source: 'archetype-tier' };
  }

  // ── P5: Tier fallback — enriched with context ──
  const base = tierFallbacks[tier];
  const leanOnSuffix = hasContextEnrichment ? buildDaytimeLeanOnSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
  const watchForSuffix = hasContextEnrichment ? buildDaytimeWatchForSuffix(todayHighStakes, wearableContext, timeOfDay) : '';
  return { leanOn: `Based on your current readiness state: ${base.leanOn}${leanOnSuffix}`, watchFor: `Based on your current readiness state: ${base.watchFor}${watchForSuffix}`, source: 'tier-fallback' };
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
      userId = await verifyAuth0JWT(authHeader);
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

    // ── Fetch wearable data (always — mornings use sleep, evenings use HR/HRV) ──
    let wearableContext: WearableContext | null = null;
    try {
      const { data: wearableRow } = await db
        .from('wearable_data')
        .select('hrv, resting_heart_rate, heart_rate, sleep_score, sleep_duration')
        .eq('user_id', userId)
        .order('recorded_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wearableRow) {
        const rhr = wearableRow.resting_heart_rate || null;
        const peakHR = wearableRow.heart_rate || null;
        const hrv = wearableRow.hrv || null;
        const sleepScore = wearableRow.sleep_score || null;
        const sleepDuration = wearableRow.sleep_duration || null;
        // Elevated HR: peak > 100 or > 120% of RHR
        const hrElevated = peakHR !== null && (peakHR > 100 || (rhr !== null && peakHR > rhr * 1.2));
        // HRV stress: below 30ms absolute (low) — a simple heuristic
        const hrvElevated = hrv !== null && hrv < 30;
        // Poor sleep: score < 60 or duration < 6 hours (360 min)
        const poorSleep = (sleepScore !== null && sleepScore < 60) || (sleepDuration !== null && sleepDuration < 360);
        // RHR elevated: resting heart rate above 75bpm baseline
        const rhrElevated = rhr !== null && rhr > 75;
        wearableContext = {
          hrv,
          rhr,
          peakHR,
          sleepScore,
          sleepDuration,
          hrvElevated,
          hrElevated,
          poorSleep,
          rhrElevated,
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

    // Fetch coach insights, check-ins, and archetype in parallel
    const [coachRes, checkInRes, profileRes] = await Promise.all([
      db.from('user_coach_insights')
        .select('insight_type, insight_content, created_at')
        .eq('user_id', userId)
        .in('insight_type', ['strength', 'growth_area'])
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5),
      db.from('daily_checkins')
        .select('checkin_date, outcome, clarity_level, confidence_level')
        .eq('user_id', userId)
        .gte('checkin_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
        .order('checkin_date', { ascending: false })
        .limit(10),
      db.from('profiles')
        .select('user_archetype')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const coachInsights = coachRes.data || [];
    const recentCheckIns = checkInRes.data || [];
    const serverArchetype = profileRes.data?.user_archetype || null;
    
    const strengthInsight = coachInsights.find((i: { insight_type: string }) => i.insight_type === 'strength');
    const growthInsight = coachInsights.find((i: { insight_type: string }) => i.insight_type === 'growth_area');
    const coachStrength = strengthInsight?.insight_content || null;
    const coachGrowth = growthInsight?.insight_content || null;
    const coachInsightCreatedAt = strengthInsight?.created_at || growthInsight?.created_at || null;

    const theme = getTheme(safeTier, calendarPressure, calendarLoad, innerReadinessScore, hour, dayOfWeek, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext, todayHighStakes, calendarResult.eventCount, calendarResult.remainingEvents, calendarResult.remainingHighStakes);
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
    
    // "Strength without clarity" override — independent signals
    const ccProvided = clarityLevel !== null || confidenceLevel !== null;
    let finalPhrase = theme.phrase;
    let finalContext = patternOverride || theme.context;
    
    if (ccProvided && (safeTier === 'strong' || safeTier === 'peak')) {
      const cLow = clarityLevel !== null && clarityLevel <= 2;
      const confLow = confidenceLevel !== null && confidenceLevel <= 2;
      if (cLow || confLow) {
        finalPhrase = "Strength without clarity.";
        finalContext = "Your felt energy is high, but your internal compass — clarity and confidence — is signalling uncertainty. High activation without direction can lead to misplaced effort. Before deploying your readiness, find your anchor.";
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
      todayHighStakes, calendarResult.eventCount
    );

    const coachUsed = leanOnResult.source.startsWith('coach');
    const wearableUsed = !!wearableContext;
    const dataSources = buildDataSources(calendarResult.state, serverArchetype, checkInOutcome, coachUsed, wearableUsed);

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

    const result: OuterReadinessResult = {
      phrase: finalPhrase,
      context: finalContext,
      leanOn: leanOnResult.leanOn,
      watchFor: leanOnResult.watchFor,
      driver: theme.driver,
      dataSources,
      calendarState: calendarResult.state,
      coachInsightAge: leanOnResult.coachInsightAge,
      coachInsightLabel: leanOnResult.coachInsightLabel,
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
