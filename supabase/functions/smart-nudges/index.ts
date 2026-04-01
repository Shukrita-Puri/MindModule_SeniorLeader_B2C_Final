import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── APNs Helper Functions ──

/**
 * Create a JWT for APNs authentication using ES256 (ECDSA P-256 + SHA-256).
 */
async function createApnsJwt(p8Key: string, keyId: string, teamId: string): Promise<string> {
  const pemBody = p8Key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = { alg: 'ES256', kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = encode(header);
  const claimsB64 = encode(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

/**
 * Send a push notification to a single iOS device via APNs HTTP/2.
 */
async function sendApnsPush(
  deviceToken: string,
  jwt: string,
  bundleId: string,
  title: string,
  body: string,
  customData: Record<string, string>,
  apnsHost: string = 'api.sandbox.push.apple.com'
): Promise<boolean> {
  const apnsPayload = {
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
      'mutable-content': 1,
    },
    ...customData,
  };

  const url = `https://${apnsHost}/3/device/${deviceToken}`;

  console.log(`[APNs] Sending to ${apnsHost} | topic=${bundleId} | token=${deviceToken.substring(0, 12)}... (${deviceToken.length} chars)`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[APNs] Failed (${response.status}): ${errBody} – host=${apnsHost} topic=${bundleId} token=${deviceToken.substring(0, 12)}...`);
    if (response.status === 410 || response.status === 400) {
      console.log(`[APNs] Deactivating invalid token: ${deviceToken.substring(0, 12)}...`);
    }
    return false;
  }

  await response.text();
  console.log(`[APNs] Success – token=${deviceToken.substring(0, 12)}...`);
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ══════════════════════════════════════════════════════════════
// ── SIGNAL-FIRST ARCHITECTURE: Types & Constants ──
// ══════════════════════════════════════════════════════════════

const DAILY_NOTIFICATION_CAP = 3;
const LOW_TIERS = ['depleted', 'managing'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Noise filter (aligned with JIT pipeline)
const NOISE_KEYWORDS = [
  'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
  'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
  'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
  'car service', 'mot', 'oil change', 'dentist', 'optician',
  'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
  'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
];
const NOISE_PATTERN = /\[\d{6,}\]/;

function isNoiseEvent(title: string): boolean {
  const lower = (title || '').toLowerCase();
  if (NOISE_PATTERN.test(title || '')) return true;
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'negotiation', 'pitch',
  'review', 'performance', 'strategy', 'stakeholder',
  'crisis', 'conflict', 'termination', 'layoff', 'restructure',
  'merger', 'acquisition', 'due diligence', 'fundraise', 'ipo',
  'media', 'press', 'interview', 'keynote', 'panel', 'town hall',
  'all-hands', 'offsite', 'retreat',
];

function scoreEvent(title: string | null): number {
  if (!title) return 0;
  const lower = title.toLowerCase();
  let score = 0;
  for (const kw of HIGH_STAKES_KEYWORDS) {
    if (lower.includes(kw)) score += 25;
  }
  return Math.min(score, 100);
}

function isHighStakes(title: string | null): boolean {
  return scoreEvent(title) >= 25;
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── NudgeContext: all signals assembled once per user ──

interface CalendarEvent {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  external_id: string;
  is_organizer?: boolean;
  attendees_count?: number;
}

interface CalendarGap {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  nextEvent: CalendarEvent;
  postGapMeetingCount: number;
  postGapHasHighStakes: boolean;
}

interface WearableSignals {
  sleepScore: number | null;
  hrv: number | null;
  rhr: number | null;
  hrvBaseline30d: number | null;
  rhrBaseline30d: number | null;
  hrvDeltaPct: number | null;
  rhrElevated: boolean;
  totalSleepMinutes: number | null;
}

interface CoachSignals {
  pendingCommitments: Array<{ text: string; overdueDays: number; patternArea: string | null; metaSkill: string | null }>;
  activePatterns: Array<{ description: string; patternArea: string | null; observationCount: number }>;
  stressSignals: Array<{ topic: string; sessionId: string }>;
  lastSessionAt: Date | null;
  sessionsIn7d: number;
}

interface NudgeContext {
  userId: string;
  todayStr: string;
  tomorrowStr: string;
  localHour: number;
  localMinute: number;
  localTime: number;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  // Calendar
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  nonNoiseEvents: CalendarEvent[];
  firstNonNoiseEvent: CalendarEvent | null;
  eventCount: number;
  highStakesEvents: CalendarEvent[];
  calendarGaps: CalendarGap[];
  dayType: 'light' | 'moderate' | 'heavy' | 'extreme';
  // Wearable
  wearable: WearableSignals;
  // Coach
  coach: CoachSignals;
  // Check-in
  morningCheckinOutcome: string | null;
  afternoonCheckinOutcome: string | null;
  lastCheckinTime: Date | null;
  checkinCountToday: number;
  // Mastery plan
  pendingPracticeIds: string[];
  completedPracticeIds: string[];
  // JIT
  jitEvents: Array<{ eventId: string; eventTitle: string; eventStart: string; finalScore: number; externalId: string; confidenceBand: string }>;
  // Performance correlations (30d)
  coachSessionReadinessLift: number | null; // % lift on days after coach session
  practiceCompletionCorrelation: number | null; // % lift on days after practice
  // Streak
  currentStreak: number;
  // Suppression signals
  lastAppOpen: Date | null;
  inMeetingNow: boolean;
  // Energy snapshot
  hrvDeltaPctFromSnapshot: number | null;
}

interface NudgeCopy {
  title: string;
  body: string;
  variantId: string;
}

interface QualifiedNudge {
  type: string;
  copy: NudgeCopy;
  eventReference?: string;
  priority: number;
}

// ══════════════════════════════════════════════════════════════
// ── buildNudgeContext() – Central Signal Assembly ──
// ══════════════════════════════════════════════════════════════

async function buildNudgeContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  todayStr: string,
  tomorrowStr: string,
  localHour: number,
  localMinute: number,
  dayOfWeek: number,
  currentStreak: number,
  lastAppOpen: Date | null,
): Promise<NudgeContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // All queries in parallel
  const [
    { data: todayEventsRaw },
    { data: tomorrowEventsRaw },
    { data: latestWearable },
    { data: wearable30d },
    { data: latestSnapshot },
    { data: pendingCommitments },
    { data: activePatterns },
    { data: recentSessions },
    { data: todayCheckins },
    { data: todayRituals },
    { data: jitEventsRaw },
    { data: practiceSessions30d },
    { data: checkins30d },
  ] = await Promise.all([
    // Today's calendar events
    supabase.from('calendar_events')
      .select('id, title, start_time, end_time, external_id, is_organizer, attendees_count')
      .eq('user_id', userId)
      .gte('start_time', `${todayStr}T00:00:00`)
      .lte('start_time', `${todayStr}T23:59:59`)
      .order('start_time', { ascending: true }),
    // Tomorrow's calendar events (for Sunday→Monday, evening→tomorrow)
    supabase.from('calendar_events')
      .select('id, title, start_time, end_time, external_id, is_organizer, attendees_count')
      .eq('user_id', userId)
      .gte('start_time', `${tomorrowStr}T00:00:00`)
      .lte('start_time', `${tomorrowStr}T23:59:59`)
      .order('start_time', { ascending: true }),
    // Latest wearable data
    supabase.from('wearable_data')
      .select('hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date')
      .eq('user_id', userId)
      .order('summary_date', { ascending: false })
      .limit(1),
    // 30-day wearable baseline
    supabase.from('wearable_data')
      .select('hrv, resting_heart_rate')
      .eq('user_id', userId)
      .gte('summary_date', thirtyDaysAgo.split('T')[0])
      .not('hrv', 'is', null),
    // Today's energy snapshot
    supabase.from('energy_snapshots')
      .select('oura_readiness, computed_data')
      .eq('user_id', userId)
      .eq('snapshot_date', todayStr)
      .limit(1)
      .maybeSingle(),
    // Pending coach commitments
    supabase.from('coach_accountability_tracker')
      .select('commitment_text, committed_at, check_in_due_date, status, pattern_area, meta_skill')
      .eq('user_id', userId)
      .eq('status', 'pending'),
    // Active coach pattern observations
    supabase.from('coach_pattern_observations')
      .select('pattern_description, pattern_area, observation_count')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('observation_count', { ascending: false })
      .limit(5),
    // Recent coach dialogue sessions (7d)
    supabase.from('dialogue_sessions')
      .select('id, started_at, session_title, flow_type')
      .eq('user_id', userId)
      .eq('flow_type', 'coach')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false }),
    // Today's check-ins
    supabase.from('daily_checkins')
      .select('outcome, time_window, timestamp')
      .eq('user_id', userId)
      .eq('checkin_date', todayStr)
      .order('timestamp', { ascending: true }),
    // Today's ritual completions
    supabase.from('daily_ritual_completions')
      .select('recommended_practice_ids, completed_practice_ids, session_period, completion_status')
      .eq('user_id', userId)
      .eq('ritual_date', todayStr),
    // JIT events (next 90 min, score >= 55)
    supabase.from('jit_event_context')
      .select('id, event_title, event_start, final_score, confidence_band')
      .eq('user_id', userId)
      .gte('event_start', new Date(now.getTime() + 30 * 60000).toISOString())
      .lte('event_start', new Date(now.getTime() + 90 * 60000).toISOString())
      .gte('final_score', 55)
      .order('final_score', { ascending: false }),
    // Practice sessions (30d) for performance correlation
    supabase.from('practice_sessions')
      .select('completed_at, completed, content_id')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('created_at', thirtyDaysAgo),
    // Check-ins (30d) for performance correlation
    supabase.from('daily_checkins')
      .select('checkin_date, outcome, time_window')
      .eq('user_id', userId)
      .gte('checkin_date', thirtyDaysAgo.split('T')[0])
      .order('checkin_date', { ascending: true }),
  ]);

  // Fetch session summaries separately (depends on recentSessions)
  const sessionIds = (recentSessions || []).map(s => s.id).filter(Boolean);
  const { data: sessionSummaries } = sessionIds.length > 0
    ? await supabase.from('coach_session_summaries')
        .select('session_id, key_topics, commitments_made')
        .in('session_id', sessionIds)
    : { data: [] as any[] };

  // Process wearable signals
  const latestW = latestWearable?.[0];
  const hrvValues = (wearable30d || []).map(w => w.hrv).filter((v): v is number => v !== null);
  const rhrValues = (wearable30d || []).map(w => w.resting_heart_rate).filter((v): v is number => v !== null);
  const hrvBaseline = hrvValues.length > 0 ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : null;
  const rhrBaseline = rhrValues.length > 0 ? rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length : null;

  const hrvDeltaPct = (latestW?.hrv && hrvBaseline) 
    ? Math.round(((latestW.hrv - hrvBaseline) / hrvBaseline) * 100) 
    : null;
  const rhrElevated = (latestW?.resting_heart_rate && rhrBaseline)
    ? latestW.resting_heart_rate > rhrBaseline * 1.1
    : false;

  // HRV delta from energy snapshot (may differ from wearable calc)
  const snapshotComputed = latestSnapshot?.computed_data as Record<string, unknown> | null;
  const hrvDeltaPctFromSnapshot = snapshotComputed?.hrv_delta_pct as number | null ?? hrvDeltaPct;

  // Process calendar
  const todayEvents = (todayEventsRaw || []) as CalendarEvent[];
  const tomorrowEvents = (tomorrowEventsRaw || []) as CalendarEvent[];
  const nonNoiseEvents = todayEvents.filter(e => !isNoiseEvent(e.title || ''));
  const highStakesEvents = nonNoiseEvents.filter(e => isHighStakes(e.title));

  // Day type classification
  const eventCount = nonNoiseEvents.length;
  let dayType: 'light' | 'moderate' | 'heavy' | 'extreme' = 'light';
  if (eventCount >= 8) dayType = 'extreme';
  else if (eventCount >= 6) dayType = 'heavy';
  else if (eventCount >= 3) dayType = 'moderate';

  // Calendar gaps (≥20 min between events)
  const calendarGaps: CalendarGap[] = [];
  for (let i = 0; i < nonNoiseEvents.length - 1; i++) {
    const currentEnd = new Date(nonNoiseEvents[i].end_time);
    const nextStart = new Date(nonNoiseEvents[i + 1].start_time);
    const gapMs = nextStart.getTime() - currentEnd.getTime();
    const gapMinutes = gapMs / 60000;
    if (gapMinutes >= 20) {
      // Count post-gap meetings and check for high-stakes
      const postGapEvents = nonNoiseEvents.slice(i + 1);
      calendarGaps.push({
        startTime: currentEnd,
        endTime: nextStart,
        durationMinutes: Math.round(gapMinutes),
        nextEvent: nonNoiseEvents[i + 1],
        postGapMeetingCount: postGapEvents.length,
        postGapHasHighStakes: postGapEvents.some(e => isHighStakes(e.title)),
      });
    }
  }

  // Currently in a meeting?
  const inMeetingNow = todayEvents.some(e => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    return now >= start && now <= end;
  });

  // Coach signals
  const commitments = (pendingCommitments || []).map(c => {
    const dueDate = c.check_in_due_date ? new Date(c.check_in_due_date) : null;
    const overdueDays = dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0;
    return {
      text: c.commitment_text,
      overdueDays,
      patternArea: c.pattern_area,
      metaSkill: c.meta_skill,
    };
  });

  // Extract stress signals from session summaries
  const stressSignals: Array<{ topic: string; sessionId: string }> = [];
  for (const summary of (sessionSummaries || [])) {
    const topics = summary.key_topics as string[] | null;
    if (topics) {
      for (const topic of topics) {
        const lower = topic.toLowerCase();
        if (lower.includes('stress') || lower.includes('anxiety') || lower.includes('worried') ||
            lower.includes('nervous') || lower.includes('overwhelm') || lower.includes('dread')) {
          stressSignals.push({ topic, sessionId: summary.session_id });
        }
      }
    }
  }

  const lastCoachSession = recentSessions?.[0];
  const lastSessionAt = lastCoachSession?.started_at ? new Date(lastCoachSession.started_at) : null;

  // Check-in data
  const morningCheckin = (todayCheckins || []).find(c => c.time_window === 'morning');
  const afternoonCheckin = (todayCheckins || []).find(c => c.time_window === 'afternoon');
  const lastCheckin = (todayCheckins || []).length > 0
    ? new Date((todayCheckins || [])[(todayCheckins || []).length - 1].timestamp)
    : null;

  // Mastery plan
  const allRecommended = (todayRituals || []).flatMap(r => r.recommended_practice_ids || []);
  const allCompleted = (todayRituals || []).flatMap(r => r.completed_practice_ids || []);
  const pendingPracticeIds = allRecommended.filter(id => !allCompleted.includes(id));

  // Performance correlation: coach session → next-day readiness lift
  let coachSessionReadinessLift: number | null = null;
  let practiceCompletionCorrelation: number | null = null;

  if ((checkins30d || []).length >= 10) {
    const checkinMap = new Map<string, string>();
    for (const c of (checkins30d || [])) {
      if (c.time_window === 'morning') {
        checkinMap.set(c.checkin_date, c.outcome);
      }
    }

    // Coach session dates
    const coachSessionDates = new Set((recentSessions || []).map(s => s.started_at?.split('T')[0]).filter(Boolean));
    const coachDayAfterOutcomes: string[] = [];
    const nonCoachDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      if (coachSessionDates.has(prevDateStr)) {
        coachDayAfterOutcomes.push(outcome);
      } else {
        nonCoachDayOutcomes.push(outcome);
      }
    }

    const outcomeScore = (o: string) => o === 'peak' ? 5 : o === 'strong' ? 4 : o === 'steady' ? 3 : o === 'managing' ? 2 : 1;

    if (coachDayAfterOutcomes.length >= 2 && nonCoachDayOutcomes.length >= 2) {
      const coachAvg = coachDayAfterOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / coachDayAfterOutcomes.length;
      const nonCoachAvg = nonCoachDayOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / nonCoachDayOutcomes.length;
      if (nonCoachAvg > 0) {
        coachSessionReadinessLift = Math.round(((coachAvg - nonCoachAvg) / nonCoachAvg) * 100);
      }
    }

    // Practice completion → next-day outcome correlation
    const practiceDates = new Set(
      (practiceSessions30d || []).map(p => p.completed_at?.split('T')[0]).filter(Boolean)
    );
    const practiceDayAfterOutcomes: string[] = [];
    const noPracticeDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      if (practiceDates.has(prevDateStr)) {
        practiceDayAfterOutcomes.push(outcome);
      } else {
        noPracticeDayOutcomes.push(outcome);
      }
    }

    if (practiceDayAfterOutcomes.length >= 2 && noPracticeDayOutcomes.length >= 2) {
      const practiceAvg = practiceDayAfterOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / practiceDayAfterOutcomes.length;
      const noPracticeAvg = noPracticeDayOutcomes.reduce((a, o) => a + outcomeScore(o), 0) / noPracticeDayOutcomes.length;
      if (noPracticeAvg > 0) {
        practiceCompletionCorrelation = Math.round(((practiceAvg - noPracticeAvg) / noPracticeAvg) * 100);
      }
    }
  }

  // JIT events
  const jitEvents = (jitEventsRaw || []).map(e => ({
    eventId: e.id,
    eventTitle: e.event_title,
    eventStart: e.event_start,
    finalScore: e.final_score || 0,
    externalId: e.id, // use id as reference
    confidenceBand: e.confidence_band || 'low',
  }));

  return {
    userId,
    todayStr,
    tomorrowStr,
    localHour,
    localMinute,
    localTime: localHour + localMinute / 60,
    dayOfWeek,
    dayName: DAYS[dayOfWeek],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    todayEvents,
    tomorrowEvents,
    nonNoiseEvents,
    firstNonNoiseEvent: nonNoiseEvents.length > 0 ? nonNoiseEvents[0] : null,
    eventCount,
    highStakesEvents,
    calendarGaps,
    dayType,
    wearable: {
      sleepScore: latestW?.sleep_score ?? null,
      hrv: latestW?.hrv ?? null,
      rhr: latestW?.resting_heart_rate ?? null,
      hrvBaseline30d: hrvBaseline,
      rhrBaseline30d: rhrBaseline,
      hrvDeltaPct,
      rhrElevated,
      totalSleepMinutes: latestW?.total_sleep_minutes ?? null,
    },
    coach: {
      pendingCommitments: commitments,
      activePatterns: (activePatterns || []).map(p => ({
        description: p.pattern_description,
        patternArea: p.pattern_area,
        observationCount: p.observation_count || 0,
      })),
      stressSignals,
      lastSessionAt,
      sessionsIn7d: (recentSessions || []).length,
    },
    morningCheckinOutcome: morningCheckin?.outcome || null,
    afternoonCheckinOutcome: afternoonCheckin?.outcome || null,
    lastCheckinTime: lastCheckin,
    checkinCountToday: (todayCheckins || []).length,
    pendingPracticeIds,
    completedPracticeIds: allCompleted,
    jitEvents,
    coachSessionReadinessLift,
    practiceCompletionCorrelation,
    currentStreak,
    lastAppOpen,
    inMeetingNow,
    hrvDeltaPctFromSnapshot,
  };
}

// ══════════════════════════════════════════════════════════════
// ── AI Copy Generation ──
// ══════════════════════════════════════════════════════════════

async function generateNudgeCopy(
  ctx: NudgeContext,
  nudgeType: string,
  specificSignals: Record<string, unknown> = {}
): Promise<NudgeCopy | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.warn('[smart-nudges] No LOVABLE_API_KEY – using static fallback');
    return null;
  }

  const systemPrompt = `You are writing push notifications for a C-suite leader's performance coaching app. 
Rules:
- Title: max 5 words, no emoji
- Body: max 15 words, performance-oriented tone
- NEVER use: wellness, mindfulness, relax, well done, great job, amazing
- For evenings/weekends: use softer, permission-to-stop tone – but still reference specific signals
- Every nudge must reference something specific (a meeting title, a number, a commitment, a state)
- If a signal is null, skip it – never fabricate data
- Return ONLY valid JSON: {"title":"...","body":"..."}`;

  let userPrompt = '';

  switch (nudgeType) {
    case 'morning_prep': {
      const firstEvent = specificSignals.firstEventTitle || ctx.firstNonNoiseEvent?.title;
      const firstEventTime = specificSignals.firstEventTime || (ctx.firstNonNoiseEvent ? new Date(ctx.firstNonNoiseEvent.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);
      userPrompt = `Morning preparation nudge.
Signals:
- First event: ${firstEvent || 'none'} at ${firstEventTime || 'unknown'}
- Day type: ${ctx.dayType} (${ctx.eventCount} meetings)
- High-stakes today: ${ctx.highStakesEvents.map(e => e.title).join(', ') || 'none'}
- Sleep score: ${ctx.wearable.sleepScore ?? 'unavailable'}
- HRV vs baseline: ${ctx.wearable.hrvDeltaPct !== null ? `${ctx.wearable.hrvDeltaPct}%` : 'unavailable'}
- RHR: ${ctx.wearable.rhrElevated ? 'elevated above baseline' : 'normal'}
- Day: ${ctx.dayName}
${ctx.wearable.sleepScore !== null && ctx.wearable.sleepScore < 60 ? 'PRIORITY: Lead with recovery signal – sleep was poor' : ''}
${ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15 ? 'PRIORITY: Lead with HRV recovery signal' : ''}
${ctx.highStakesEvents.length > 0 ? `PRIORITY: Name the high-stakes event: ${ctx.highStakesEvents[0].title}` : ''}`;
      break;
    }

    case 'jit_pre_event': {
      const evt = specificSignals as { eventTitle: string; minutesUntil: number };
      userPrompt = `JIT pre-event nudge. The user's mental readiness plan is ready.
Signals:
- Event: ${evt.eventTitle} in ${evt.minutesUntil} minutes
- HRV: ${ctx.wearable.hrvDeltaPct !== null ? `${ctx.wearable.hrvDeltaPct}% vs baseline` : 'unavailable'}
- Current state: ${ctx.morningCheckinOutcome || 'unknown'}
- Today: ${ctx.dayType} day (${ctx.eventCount} meetings)
Must reference the event by name and mention the prep plan is ready.`;
      break;
    }

    case 'calendar_gap': {
      const gap = specificSignals as { durationMinutes: number; nextEventTitle: string; postGapHeavy: boolean };
      userPrompt = `Calendar gap nudge. User has a ${gap.durationMinutes}-minute gap before their next meeting.
Signals:
- Gap: ${gap.durationMinutes} mins
- Next meeting: ${gap.nextEventTitle}
- Post-gap load: ${gap.postGapHeavy ? 'heavy block ahead' : 'moderate'}
- HRV: ${ctx.wearable.hrvDeltaPct !== null ? `${ctx.wearable.hrvDeltaPct}%` : 'unavailable'}
- RHR: ${ctx.wearable.rhrElevated ? 'elevated' : 'normal'}
Reference the gap duration and what comes after it.`;
      break;
    }

    case 'coach_meeting_match': {
      const match = specificSignals as { commitmentText: string; meetingTitle: string; minutesUntil: number };
      userPrompt = `Coach commitment + meeting match nudge. Tone: your coach spotted this connection, not an algorithm.
Signals:
- Coach commitment: "${match.commitmentText}"
- Upcoming meeting: ${match.meetingTitle} in ${match.minutesUntil} mins
These appear related. Write one sentence connecting them.`;
      break;
    }

    case 'performance_state': {
      const perf = specificSignals as { subType: string };
      if (perf.subType === 'feature_performance') {
        const lift = ctx.coachSessionReadinessLift;
        const nextHighStakes = ctx.highStakesEvents[0]?.title || (ctx.tomorrowEvents.find(e => isHighStakes(e.title))?.title);
        userPrompt = `Feature performance nudge. Use data to build trust.
Signals:
- Coach session readiness lift: ${lift}%
- Next high-stakes event: ${nextHighStakes || 'upcoming'}
- Last coach session: ${ctx.coach.lastSessionAt ? `${Math.round((Date.now() - ctx.coach.lastSessionAt.getTime()) / 3600000)}h ago` : 'not recent'}
Example: "You perform X% sharper after a coach session – [event] is tomorrow"`;
      } else {
        // State-aware afternoon
        userPrompt = `State-aware afternoon nudge. User started low and has heavy afternoon.
Signals:
- Morning state: ${ctx.morningCheckinOutcome}
- Afternoon high-stakes: ${ctx.highStakesEvents.filter(e => new Date(e.start_time).getHours() >= 12).map(e => e.title).join(', ') || 'none'}
- HRV: ${ctx.wearable.hrvDeltaPct !== null ? `${ctx.wearable.hrvDeltaPct}%` : 'unavailable'}
- RHR: ${ctx.wearable.rhrElevated ? 'elevated – body is carrying load' : 'normal'}
Reference the specific state and what's ahead.`;
      }
      break;
    }

    case 'evening_close': {
      const isWeekendEvening = ctx.isWeekend || ctx.dayOfWeek === 5;
      const isSundayEvening = ctx.dayOfWeek === 0;
      const tomorrowHighStakes = ctx.tomorrowEvents.filter(e => isHighStakes(e.title));
      const tomorrowEventCount = ctx.tomorrowEvents.filter(e => !isNoiseEvent(e.title || '')).length;

      userPrompt = `Evening cool-down nudge. ${isWeekendEvening ? 'WEEKEND: Use softer, permission-to-rest tone.' : ''}
${isSundayEvening ? `SUNDAY EVENING: Reference Monday signals – ${tomorrowEventCount} meetings tomorrow${tomorrowHighStakes.length > 0 ? `, including: ${tomorrowHighStakes.map(e => e.title).join(', ')}` : ''}.` : ''}
Today's signals:
- Meetings today: ${ctx.eventCount}
- High-stakes today: ${ctx.highStakesEvents.map(e => e.title).join(', ') || 'none'}
- HRV end of day vs baseline: ${ctx.wearable.hrvDeltaPct !== null ? `${ctx.wearable.hrvDeltaPct}%` : 'unavailable'}
- RHR: ${ctx.wearable.rhrElevated ? 'elevated through the day' : 'normal'}
- Check-ins today: ${ctx.checkinCountToday}
${ctx.dayOfWeek === 5 ? 'FRIDAY: Close-the-week tone' : ''}
${ctx.dayOfWeek === 6 ? 'SATURDAY: Gentle unwind, no agenda' : ''}
Tone: permission to stop, not another task. NEVER say: wellness, mindfulness, relax, well done.
${isWeekendEvening ? 'Use warmer, softer language. The weekend is theirs.' : ''}`;
      break;
    }

    case 'pattern_alert': {
      const pattern = specificSignals as { patternDescription: string; patternType: string };
      userPrompt = `Pattern alert nudge. A pattern has been detected worth naming.
Pattern: ${pattern.patternDescription}
Type: ${pattern.patternType}
Reference the specific pattern. Tone: curious observation, not alarm.`;
      break;
    }

    case 'daily_fallback': {
      // Use best available signal
      const bestSignal = ctx.highStakesEvents.length > 0
        ? `High-stakes event today: ${ctx.highStakesEvents[0].title}`
        : ctx.wearable.sleepScore !== null
          ? `Sleep score: ${ctx.wearable.sleepScore}`
          : ctx.dayType !== 'light'
            ? `${ctx.dayType} day ahead (${ctx.eventCount} meetings)`
            : ctx.currentStreak > 0
              ? `Day ${ctx.currentStreak} of practice streak`
              : 'Start of day';
      userPrompt = `Daily fallback nudge. Use the best available signal.
Best signal: ${bestSignal}
Day: ${ctx.dayName}, ${ctx.dayType} (${ctx.eventCount} events)
Tone: gentle invitation, not pressure.`;
      break;
    }

    default:
      return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[smart-nudges] AI copy generation failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.title && parsed.body) {
      return {
        title: parsed.title.substring(0, 60),
        body: parsed.body.substring(0, 120),
        variantId: `AI-${nudgeType}-${Date.now()}`,
      };
    }
    return null;
  } catch (e) {
    console.warn(`[smart-nudges] AI copy error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── Static Fallback Variants ──
// ══════════════════════════════════════════════════════════════

function getFallbackMorningCopy(ctx: NudgeContext): NudgeCopy {
  if (ctx.wearable.sleepScore !== null && ctx.wearable.sleepScore < 60) {
    return { title: 'Ground First', body: 'Low recovery last night. Ground yourself before the day starts.', variantId: 'FB-MA-recovery' };
  }
  if (ctx.highStakesEvents.length > 0) {
    return { title: 'Prep Ready', body: `${ctx.highStakesEvents[0].title || 'High-stakes event'} today. Check in first.`, variantId: 'FB-MA-stakes' };
  }
  if (ctx.dayType === 'heavy' || ctx.dayType === 'extreme') {
    return { title: 'Heavy Day Ahead', body: `${ctx.eventCount} meetings today. Your Compass is ready.`, variantId: 'FB-MA-heavy' };
  }
  if (ctx.isWeekend) {
    return { title: 'Weekend Morning', body: 'No calendar pressure today. Check in when you\'re ready.', variantId: 'FB-MA-weekend' };
  }
  return { title: 'Your Compass is Ready', body: `Your ${ctx.dayName} is mapped. Check in to see your Compass.`, variantId: 'FB-MA-default' };
}

function getFallbackJitCopy(eventTitle: string, minutesUntil: number): NudgeCopy {
  return { title: 'Prep Ready', body: `${eventTitle} in ${minutesUntil} min. Open your prep.`, variantId: 'FB-JIT' };
}

function getFallbackGapCopy(durationMinutes: number, nextTitle: string): NudgeCopy {
  return { title: 'Gap Window', body: `${durationMinutes} mins before ${nextTitle}. A good moment to prepare.`, variantId: 'FB-GAP' };
}

function getFallbackCoachMatchCopy(commitment: string, meetingTitle: string): NudgeCopy {
  return { title: 'Coach Connection', body: `You committed to work on this – ${meetingTitle} is the moment.`, variantId: 'FB-COACH' };
}

function getFallbackEveningCopy(ctx: NudgeContext): NudgeCopy {
  if (ctx.dayOfWeek === 0) {
    // Sunday evening – reference Monday
    const tomorrowCount = ctx.tomorrowEvents.filter(e => !isNoiseEvent(e.title || '')).length;
    const tomorrowStakes = ctx.tomorrowEvents.filter(e => isHighStakes(e.title));
    if (tomorrowStakes.length > 0) {
      return { title: 'Week Ahead', body: `Monday has ${tomorrowStakes[0].title}. Set your intention tonight.`, variantId: 'FB-EC-sun-stakes' };
    }
    if (tomorrowCount > 0) {
      return { title: 'Week Ahead', body: `${tomorrowCount} meetings Monday. Close tonight, prepare tomorrow.`, variantId: 'FB-EC-sun' };
    }
    return { title: 'Sunday Close', body: 'Sunday close. What do you want to carry into the new week?', variantId: 'FB-EC-sun-default' };
  }
  if (ctx.dayOfWeek === 5) {
    return { title: 'Week Complete', body: 'Five days behind you. Close the week before you switch off.', variantId: 'FB-EC-fri' };
  }
  if (ctx.dayOfWeek === 6) {
    return { title: 'Saturday Close', body: 'No agenda tonight. Just notice how you\'re landing.', variantId: 'FB-EC-sat' };
  }
  if (ctx.wearable.rhrElevated) {
    return { title: 'Body Carried Load', body: 'Your body carried load today. A proper close helps you let go.', variantId: 'FB-EC-rhr' };
  }
  if (ctx.eventCount >= 6) {
    return { title: 'Heavy Day Done', body: `${ctx.eventCount} meetings done. One check-in to close the loop.`, variantId: 'FB-EC-heavy' };
  }
  return { title: 'Evening Close', body: `The day is done. A quiet moment to close the loop.`, variantId: 'FB-EC-default' };
}

function getFallbackPerformanceStateCopy(ctx: NudgeContext, subType: string): NudgeCopy {
  if (subType === 'feature_performance') {
    const lift = ctx.coachSessionReadinessLift || 20;
    return { title: 'Coach Impact', body: `You perform ${lift}% sharper after a coach session. Worth one tonight?`, variantId: 'FB-PERF' };
  }
  // State-aware
  const hsCount = ctx.highStakesEvents.filter(e => new Date(e.start_time).getHours() >= 12).length;
  return { title: 'Afternoon Reset', body: `You started low. ${hsCount > 0 ? `${hsCount} high-stakes ahead.` : 'Heavy afternoon.'} Reset now.`, variantId: 'FB-STATE' };
}

function getFallbackDailyFallbackCopy(ctx: NudgeContext): NudgeCopy {
  if (ctx.highStakesEvents.length > 0) {
    return { title: 'Day Mapped', body: `${ctx.highStakesEvents[0].title} today. Check in to prepare.`, variantId: 'FB-DAILY-hs' };
  }
  return { title: 'Check In', body: 'Take 30 seconds to check in. Your Compass is ready.', variantId: 'FB-DAILY' };
}

// ══════════════════════════════════════════════════════════════
// ── Priority Cascade Evaluators (P0–P7) ──
// ══════════════════════════════════════════════════════════════

// P0: Morning Preparation
async function evaluateMorningPrep(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('morning_prep')) return null;
  if (ctx.morningCheckinOutcome !== null) return null; // Already checked in

  // Calendar-aware timing
  let morningStart = 6.5;
  let morningEnd = 9.5;

  if (ctx.firstNonNoiseEvent) {
    const eventTime = new Date(ctx.firstNonNoiseEvent.start_time);
    const eventHour = eventTime.getHours() + eventTime.getMinutes() / 60;
    // Estimate commute: virtual events → 20-30 min buffer, otherwise 60-90 min
    const title = (ctx.firstNonNoiseEvent.title || '').toLowerCase();
    const isVirtual = title.includes('zoom') || title.includes('teams') || title.includes('call') || title.includes('video') || title.includes('virtual');
    const commuteBuffer = isVirtual ? 0.5 : 1.25; // hours
    const idealStart = eventHour - commuteBuffer - 0.33; // minus 20 min
    morningStart = Math.max(6.5, Math.min(idealStart, 9.5));
    morningEnd = Math.max(morningEnd, morningStart + 1.5);
  }

  // Weekend: shift later
  if (ctx.dayOfWeek === 6) { morningStart = Math.max(morningStart, 7.5); morningEnd = Math.max(morningEnd, 10); }
  if (ctx.dayOfWeek === 0) { morningStart = Math.max(morningStart, 8); morningEnd = Math.max(morningEnd, 10.5); }

  if (ctx.localTime < morningStart || ctx.localTime >= morningEnd) return null;

  // Never fire if first event < 30 min away
  if (ctx.firstNonNoiseEvent) {
    const minutesUntil = (new Date(ctx.firstNonNoiseEvent.start_time).getTime() - Date.now()) / 60000;
    if (minutesUntil < 30) return null;
  }

  const aiCopy = await generateNudgeCopy(ctx, 'morning_prep');
  const copy = aiCopy || getFallbackMorningCopy(ctx);

  return { type: 'morning_prep', copy, priority: 0 };
}

// P1: JIT Pre-Event
async function evaluateJitPreEvent(ctx: NudgeContext, alreadySentTypes: Set<string>, sentEventRefs: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('pre_event_prep')) return null;

  for (const evt of ctx.jitEvents) {
    if (evt.confidenceBand === 'none') continue;
    if (sentEventRefs.has(evt.externalId)) continue;

    const minutesUntil = Math.round((new Date(evt.eventStart).getTime() - Date.now()) / 60000);

    const aiCopy = await generateNudgeCopy(ctx, 'jit_pre_event', {
      eventTitle: evt.eventTitle || 'Upcoming event',
      minutesUntil,
    });
    const copy = aiCopy || getFallbackJitCopy(evt.eventTitle || 'Upcoming event', minutesUntil);

    return { type: 'pre_event_prep', copy, eventReference: evt.externalId, priority: 1 };
  }

  // Fallback: keyword scoring for calendar events in 30-90 min window
  if (ctx.jitEvents.length === 0) {
    const now = Date.now();
    for (const evt of ctx.nonNoiseEvents) {
      const startMs = new Date(evt.start_time).getTime();
      const minutesUntil = (startMs - now) / 60000;
      if (minutesUntil < 30 || minutesUntil > 90) continue;
      if (scoreEvent(evt.title) < 50) continue; // require 2+ keyword matches
      if (sentEventRefs.has(evt.external_id)) continue;

      const aiCopy = await generateNudgeCopy(ctx, 'jit_pre_event', {
        eventTitle: evt.title || 'Upcoming event',
        minutesUntil: Math.round(minutesUntil),
      });
      const copy = aiCopy || getFallbackJitCopy(evt.title || 'Upcoming event', Math.round(minutesUntil));

      return { type: 'pre_event_prep', copy, eventReference: evt.external_id, priority: 1 };
    }
  }

  return null;
}

// P2: Calendar Gap
async function evaluateCalendarGap(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('calendar_gap')) return null;
  if (ctx.inMeetingNow) return null;

  // Suppress if user checked in within 90 min
  if (ctx.lastCheckinTime && (Date.now() - ctx.lastCheckinTime.getTime()) < 90 * 60000) return null;

  const now = Date.now();

  for (const gap of ctx.calendarGaps) {
    // Fire 5 min into the gap
    const fiveMinIntoGap = gap.startTime.getTime() + 5 * 60000;
    if (now < fiveMinIntoGap || now > gap.endTime.getTime()) continue;

    // Only if post-gap is heavy or has high stakes
    if (gap.postGapMeetingCount < 2 && !gap.postGapHasHighStakes) continue;

    const aiCopy = await generateNudgeCopy(ctx, 'calendar_gap', {
      durationMinutes: gap.durationMinutes,
      nextEventTitle: gap.nextEvent.title || 'next meeting',
      postGapHeavy: gap.postGapHasHighStakes || gap.postGapMeetingCount >= 3,
    });
    const copy = aiCopy || getFallbackGapCopy(gap.durationMinutes, gap.nextEvent.title || 'next meeting');

    return { type: 'calendar_gap', copy, priority: 2 };
  }

  return null;
}

// P3: Coach Commitment + Meeting Match
async function evaluateCoachMeetingMatch(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  supabase: ReturnType<typeof createClient>
): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('coach_meeting_match')) return null;
  if (ctx.coach.pendingCommitments.length === 0 && ctx.coach.stressSignals.length === 0) return null;

  // Suppress if coach opened in last 2 hours
  if (ctx.coach.lastSessionAt && (Date.now() - ctx.coach.lastSessionAt.getTime()) < 2 * 60 * 60 * 1000) return null;

  // Check today's coach sessions
  const { data: todayCoachSessions } = await supabase
    .from('dialogue_sessions')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('flow_type', 'coach')
    .gte('started_at', `${ctx.todayStr}T00:00:00`)
    .limit(1);

  if (todayCoachSessions && todayCoachSessions.length > 0) return null; // Coach session happened today

  // Look at next 4 hours of events
  const now = Date.now();
  const fourHoursLater = now + 4 * 60 * 60 * 1000;
  const upcomingEvents = ctx.nonNoiseEvents.filter(e => {
    const startMs = new Date(e.start_time).getTime();
    return startMs > now && startMs < fourHoursLater;
  });

  // Semantic match: commitment keywords vs event title keywords
  for (const commitment of ctx.coach.pendingCommitments) {
    const commitWords = commitment.text.toLowerCase().split(/\s+/);
    const keyCommitWords = commitWords.filter(w => w.length > 3);

    for (const event of upcomingEvents) {
      const titleLower = (event.title || '').toLowerCase();
      const matchCount = keyCommitWords.filter(w => titleLower.includes(w)).length;
      // Also check pattern area match
      const patternMatch = commitment.patternArea && titleLower.includes(commitment.patternArea.toLowerCase());

      if (matchCount >= 1 || patternMatch) {
        const minutesUntil = Math.round((new Date(event.start_time).getTime() - now) / 60000);
        if (minutesUntil < 45 || minutesUntil > 240) continue;

        const aiCopy = await generateNudgeCopy(ctx, 'coach_meeting_match', {
          commitmentText: commitment.text,
          meetingTitle: event.title || 'upcoming meeting',
          minutesUntil,
        });
        const copy = aiCopy || getFallbackCoachMatchCopy(commitment.text, event.title || 'upcoming meeting');

        return { type: 'coach_meeting_match', copy, eventReference: event.external_id, priority: 3 };
      }
    }
  }

  // Also check stress signals vs upcoming events
  for (const signal of ctx.coach.stressSignals) {
    const stressWords = signal.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const event of upcomingEvents) {
      const titleLower = (event.title || '').toLowerCase();
      if (stressWords.some(w => titleLower.includes(w))) {
        const minutesUntil = Math.round((new Date(event.start_time).getTime() - now) / 60000);
        if (minutesUntil < 45 || minutesUntil > 240) continue;

        const aiCopy = await generateNudgeCopy(ctx, 'coach_meeting_match', {
          commitmentText: `You mentioned feeling stressed about: ${signal.topic}`,
          meetingTitle: event.title || 'upcoming meeting',
          minutesUntil,
        });
        const copy = aiCopy || getFallbackCoachMatchCopy(signal.topic, event.title || 'upcoming meeting');

        return { type: 'coach_meeting_match', copy, eventReference: event.external_id, priority: 3 };
      }
    }
  }

  return null;
}

// P4: State-Aware Afternoon (pure – feature performance moved to P6 pattern_alert)
async function evaluateStateAwareAfternoon(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('state_aware_nudge')) return null;

  // Skip on weekends; requires structured calendar pressure
  if (ctx.isWeekend) return null;
  if (ctx.localTime < 12 || ctx.localTime >= 15) return null;

  // Only fire if morning check-in was depleted/managing
  if (!ctx.morningCheckinOutcome || !LOW_TIERS.includes(ctx.morningCheckinOutcome)) return null;

  // Suppress if app opened in last 3 hours
  if (ctx.lastAppOpen && (Date.now() - ctx.lastAppOpen.getTime()) < 3 * 60 * 60 * 1000) return null;

  // Check for afternoon high-stakes events
  const afternoonHighStakes = ctx.highStakesEvents.filter(e => {
    const hour = new Date(e.start_time).getHours();
    return hour >= 12;
  });

  if (afternoonHighStakes.length >= 1) {
    const aiCopy = await generateNudgeCopy(ctx, 'performance_state', { subType: 'state_aware' });
    const copy = aiCopy || getFallbackPerformanceStateCopy(ctx, 'state_aware');
    return { type: 'state_aware_nudge', copy, priority: 4 };
  }

  return null;
}

// P5: Evening Cool-Down
async function evaluateEveningClose(ctx: NudgeContext, alreadySentTypes: Set<string>): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('evening_close')) return null;

  let eveningStart = 19;
  let eveningEnd = 22;

  // Sunday: extended for week-prep (18:00-22:00)
  if (ctx.dayOfWeek === 0) { eveningStart = 18; eveningEnd = 22; }
  // Friday: slightly earlier OK
  if (ctx.dayOfWeek === 5) { eveningStart = 18.5; }

  if (ctx.localTime < eveningStart || ctx.localTime >= eveningEnd) return null;

  // Check if evening check-in or ritual already done
  // (We still send if no evening activity completed)

  const aiCopy = await generateNudgeCopy(ctx, 'evening_close');
  const copy = aiCopy || getFallbackEveningCopy(ctx);

  return { type: 'evening_close', copy, priority: 5 };
}

// P6: Pattern Alert + Feature Performance (merged – both are data-driven observations)
async function evaluatePatternAlert(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  supabase: ReturnType<typeof createClient>
): Promise<QualifiedNudge | null> {
  if (alreadySentTypes.has('pattern_alert')) return null;

  // Suppress if app opened recently (4h)
  if (ctx.lastAppOpen && (Date.now() - ctx.lastAppOpen.getTime()) < 4 * 60 * 60 * 1000) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPatternLogs } = await supabase
    .from('notification_log')
    .select('variant_id, payload')
    .eq('user_id', ctx.userId)
    .eq('notification_type', 'pattern_alert')
    .gte('sent_at', sevenDaysAgo);

  const recentPatternTypes = new Set(
    (recentPatternLogs || []).map(l => {
      const p = l.payload as Record<string, unknown>;
      return (p?.pattern_type as string) || l.variant_id;
    })
  );

  // Pattern 0 (NEW): Feature Performance – coach session readiness lift
  // If coach correlation > 20% AND high-stakes event in next 24h AND no coach session in 48h
  if (!recentPatternTypes.has('feature_performance') &&
      ctx.coachSessionReadinessLift !== null && ctx.coachSessionReadinessLift > 20) {
    const hasUpcomingHighStakes = ctx.highStakesEvents.length > 0 ||
      ctx.tomorrowEvents.some(e => isHighStakes(e.title));
    const noRecentCoach = !ctx.coach.lastSessionAt ||
      (Date.now() - ctx.coach.lastSessionAt.getTime()) > 48 * 60 * 60 * 1000;

    if (hasUpcomingHighStakes && noRecentCoach) {
      const aiCopy = await generateNudgeCopy(ctx, 'performance_state', { subType: 'feature_performance' });
      const copy = aiCopy || getFallbackPerformanceStateCopy(ctx, 'feature_performance');
      return { type: 'pattern_alert', copy, eventReference: 'feature_performance', priority: 6 };
    }
  }

  // Pattern 1: Consecutive low state (3 days)
  if (!recentPatternTypes.has('consecutive_low')) {
    const { data: recentCheckins } = await supabase
      .from('daily_checkins')
      .select('outcome, checkin_date')
      .eq('user_id', ctx.userId)
      .order('checkin_date', { ascending: false })
      .limit(3);

    if (recentCheckins && recentCheckins.length >= 3 && recentCheckins.every(c => LOW_TIERS.includes(c.outcome))) {
      const desc = `Day ${recentCheckins.length} at ${recentCheckins[0].outcome}. Your system is showing a pattern worth noticing.`;
      const aiCopy = await generateNudgeCopy(ctx, 'pattern_alert', { patternDescription: desc, patternType: 'consecutive_low' });
      const copy = aiCopy || { title: 'Pattern Noticed', body: desc, variantId: 'PA-1' };
      return { type: 'pattern_alert', copy, eventReference: 'consecutive_low', priority: 6 };
    }
  }

  // Pattern 2: Recovery deficit (3 days low HRV)
  if (!recentPatternTypes.has('recovery_deficit')) {
    const { data: recentSnapshots } = await supabase
      .from('energy_snapshots')
      .select('snapshot_date, computed_data')
      .eq('user_id', ctx.userId)
      .order('snapshot_date', { ascending: false })
      .limit(3);

    if (recentSnapshots && recentSnapshots.length >= 3) {
      const allLowHrv = recentSnapshots.every(snap => {
        const computed = snap.computed_data as Record<string, unknown> | null;
        const hrvDelta = computed?.hrv_delta_pct as number | undefined;
        return hrvDelta !== undefined && hrvDelta <= -20;
      });

      if (allLowHrv) {
        const desc = `Your HRV has been low for 3 days. Recovery is the priority.`;
        const aiCopy = await generateNudgeCopy(ctx, 'pattern_alert', { patternDescription: desc, patternType: 'recovery_deficit' });
        const copy = aiCopy || { title: 'Recovery Priority', body: desc, variantId: 'PA-5' };
        return { type: 'pattern_alert', copy, eventReference: 'recovery_deficit', priority: 6 };
      }
    }
  }

  // Pattern 3: Streak milestone
  if (!recentPatternTypes.has('streak_milestone')) {
    const milestones = [30, 14, 7];
    for (const milestone of milestones) {
      if (ctx.currentStreak === milestone) {
        const desc = `${milestone} days. Your practice is becoming a rhythm.`;
        const aiCopy = await generateNudgeCopy(ctx, 'pattern_alert', { patternDescription: desc, patternType: 'streak_milestone' });
        const copy = aiCopy || { title: 'Rhythm Forming', body: desc, variantId: 'PA-3' };
        return { type: 'pattern_alert', copy, eventReference: 'streak_milestone', priority: 6 };
      }
    }
  }

  return null;
}

// P7: Daily Fallback
async function evaluateDailyFallback(ctx: NudgeContext, alreadySentTypes: Set<string>, todayLogCount: number): Promise<QualifiedNudge | null> {
  if (todayLogCount > 0) return null; // Only if nothing sent today
  if (ctx.localTime < 10 || ctx.localTime >= 12) return null;

  const aiCopy = await generateNudgeCopy(ctx, 'daily_fallback');
  const copy = aiCopy || getFallbackDailyFallbackCopy(ctx);

  return { type: 'daily_fallback', copy, priority: 7 };
}

// ══════════════════════════════════════════════════════════════
// ── Engagement Learning (kept from original) ──
// ══════════════════════════════════════════════════════════════

interface EngagementProfile {
  typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }>;
  suppressedTypes: string[];
}

async function getUserEngagementProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<EngagementProfile> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('notification_log')
    .select('notification_type, tapped')
    .eq('user_id', userId)
    .gte('sent_at', sevenDaysAgo);

  const typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }> = {};

  for (const log of (logs || [])) {
    const t = log.notification_type;
    if (!typeEffectiveness[t]) typeEffectiveness[t] = { sent: 0, tapped: 0, rate: 0 };
    typeEffectiveness[t].sent++;
    if (log.tapped) typeEffectiveness[t].tapped++;
  }

  const suppressedTypes: string[] = [];
  for (const [type, stats] of Object.entries(typeEffectiveness)) {
    stats.rate = stats.sent > 0 ? stats.tapped / stats.sent : 0;
    if (stats.sent >= 5 && stats.tapped === 0) {
      suppressedTypes.push(type);
    }
  }

  return { typeEffectiveness, suppressedTypes };
}

// ══════════════════════════════════════════════════════════════
// ── Day helpers ──
// ══════════════════════════════════════════════════════════════

function getUserLocalDate(timezoneOffset: number): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + timezoneOffset * 60000);
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInDND(hour: number, dndStart: number | null, dndEnd: number | null): boolean {
  if (dndStart === null || dndEnd === null) return false;
  if (dndStart < dndEnd) return hour >= dndStart && hour < dndEnd;
  return hour >= dndStart || hour < dndEnd;
}

function isQuietDay(dayOfWeek: number, quietDays: number[] | null): boolean {
  if (!quietDays || quietDays.length === 0) return false;
  return quietDays.includes(dayOfWeek);
}

// ══════════════════════════════════════════════════════════════
// ── Main Handler ──
// ══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[smart-nudges] Starting signal-first evaluation run...');

    // 1. Fetch all users with active device tokens
    const { data: tokenRows, error: tokenErr } = await supabase
      .from('notification_device_tokens')
      .select('user_id, device_token, platform')
      .eq('is_active', true);

    if (tokenErr) throw tokenErr;
    if (!tokenRows || tokenRows.length === 0) {
      console.log('[smart-nudges] No active device tokens. Exiting.');
      return new Response(JSON.stringify({ processed: 0, notifications: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group tokens by user
    const userTokens = new Map<string, Array<{ token: string; platform: string }>>();
    for (const row of tokenRows) {
      if (!userTokens.has(row.user_id)) userTokens.set(row.user_id, []);
      userTokens.get(row.user_id)!.push({ token: row.device_token, platform: row.platform });
    }

    const userIds = Array.from(userTokens.keys());
    console.log(`[smart-nudges] Evaluating ${userIds.length} users (signal-first)`);

    // 2. Batch-fetch profiles, preferences, recent engagements
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const [
      { data: profiles },
      { data: preferences },
      { data: recentEngagements },
    ] = await Promise.all([
      supabase.from('profiles').select('id, current_streak, timezone_offset').in('id', userIds),
      supabase.from('notification_preferences').select('*').in('user_id', userIds),
      supabase.from('user_engagements')
        .select('user_id, event_type, timestamp')
        .in('user_id', userIds)
        .eq('event_type', 'app_open')
        .gte('timestamp', fourHoursAgo),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const prefMap = new Map((preferences || []).map(p => [p.user_id, p]));

    const lastAppOpenMap = new Map<string, Date>();
    for (const eng of (recentEngagements || [])) {
      const ts = new Date(eng.timestamp);
      const existing = lastAppOpenMap.get(eng.user_id);
      if (!existing || ts > existing) lastAppOpenMap.set(eng.user_id, ts);
    }

    const allNotifications: Array<{
      userId: string;
      type: string;
      copy: NudgeCopy;
      eventReference?: string;
      tokens: Array<{ token: string; platform: string }>;
    }> = [];

    // 3. Evaluate each user
    for (const userId of userIds) {
      const profile = profileMap.get(userId);
      const prefs = prefMap.get(userId);
      const tzOffset = profile?.timezone_offset ?? 0;
      const localDate = getUserLocalDate(tzOffset);
      const localHour = localDate.getHours();
      const localMinute = localDate.getMinutes();
      const dayOfWeek = localDate.getDay();
      const todayStr = toDateString(localDate);

      // Tomorrow string (for Sunday→Monday signals)
      const tomorrowDate = new Date(localDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = toDateString(tomorrowDate);

      // ── Quiet Hours: 10pm–6:30am (hardened) ──
      const localTime = localHour + localMinute / 60;
      if (localTime >= 22 || localTime < 6.5) {
        console.log(`[smart-nudges] User ${userId} in quiet hours (${localTime.toFixed(1)}). Skipping.`);
        continue;
      }

      // DND / quiet day check
      const dndStart = prefs?.dnd_start ?? null;
      const dndEnd = prefs?.dnd_end ?? null;
      if (isInDND(localHour, dndStart, dndEnd)) continue;
      if (isQuietDay(dayOfWeek, prefs?.quiet_days ?? null)) continue;

      // Convert local midnight to UTC for log queries
      const localMidnightMs = new Date(`${todayStr}T00:00:00`).getTime();
      const todayStartUtc = new Date(localMidnightMs - tzOffset * 60000).toISOString();
      const todayEndUtc = new Date(localMidnightMs - tzOffset * 60000 + 24 * 60 * 60 * 1000).toISOString();

      // Fetch today's notification log
      const { data: todayLogs } = await supabase
        .from('notification_log')
        .select('notification_type, variant_id, sent_at, event_reference')
        .eq('user_id', userId)
        .gte('sent_at', todayStartUtc)
        .lt('sent_at', todayEndUtc)
        .order('sent_at', { ascending: false });

      // ── DAILY CAP ──
      if (todayLogs && todayLogs.length >= DAILY_NOTIFICATION_CAP) {
        console.log(`[smart-nudges] User ${userId} hit daily cap (${todayLogs.length}/${DAILY_NOTIFICATION_CAP}). Skipping.`);
        continue;
      }

      // 2-hour suppression check
      const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('notification_log')
        .select('sent_at')
        .eq('user_id', userId)
        .gte('sent_at', twoHoursAgoIso)
        .order('sent_at', { ascending: false })
        .limit(1);

      const lastSentAt = recentLogs?.[0] ? new Date(recentLogs[0].sent_at) : null;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const suppressed = lastSentAt !== null && lastSentAt > twoHoursAgo;

      // ── In-meeting suppression ──
      // (checked inside buildNudgeContext, but also pre-check for app open)
      const lastAppOpen = lastAppOpenMap.get(userId) || null;
      const appOpenedRecently = lastAppOpen && (Date.now() - lastAppOpen.getTime()) < 30 * 60 * 1000;

      if (appOpenedRecently && suppressed) {
        console.log(`[smart-nudges] User ${userId} app open recently + suppressed. Skipping.`);
        continue;
      }

      // ── Engagement learning ──
      const engagementProfile = await getUserEngagementProfile(supabase, userId);

      function isEngagementSuppressed(type: string): boolean {
        if (!engagementProfile.suppressedTypes.includes(type)) return false;
        const hash = (userId + type + todayStr).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return hash % 2 === 0;
      }

      // ══════════════════════════════════════════════════
      // ── Build NudgeContext (single parallel query) ──
      // ══════════════════════════════════════════════════
      const ctx = await buildNudgeContext(
        supabase, userId, todayStr, tomorrowStr,
        localHour, localMinute, dayOfWeek,
        profile?.current_streak || 0,
        lastAppOpen,
      );

      // Already-sent types today
      const alreadySentTypes = new Set((todayLogs || []).map(l => l.notification_type));
      const sentEventRefs = new Set((todayLogs || []).map(l => l.event_reference).filter(Boolean) as string[]);

      // ══════════════════════════════════════════════════
      // ── Priority Cascade: P0 → P7 ──
      // ══════════════════════════════════════════════════
      const qualified: QualifiedNudge[] = [];

      // P0: Morning Preparation
      if ((prefs?.morning_anchor_enabled ?? true) && !isEngagementSuppressed('morning_prep')) {
        const nudge = await evaluateMorningPrep(ctx, alreadySentTypes);
        if (nudge) qualified.push(nudge);
      }

      // P1: JIT Pre-Event (overrides 2h suppression)
      if ((prefs?.pre_event_prep_enabled ?? true) && !isEngagementSuppressed('pre_event_prep')) {
        const nudge = await evaluateJitPreEvent(ctx, alreadySentTypes, sentEventRefs);
        if (nudge) qualified.push(nudge);
      }

      // P2: Calendar Gap
      if (!isEngagementSuppressed('calendar_gap') && !suppressed) {
        const nudge = await evaluateCalendarGap(ctx, alreadySentTypes);
        if (nudge) qualified.push(nudge);
      }

      // P3: Coach Commitment + Meeting Match
      if (!isEngagementSuppressed('coach_meeting_match') && !suppressed) {
        const nudge = await evaluateCoachMeetingMatch(ctx, alreadySentTypes, supabase);
        if (nudge) qualified.push(nudge);
      }

      // P4: State-Aware Afternoon
      if ((prefs?.state_aware_nudge_enabled ?? true) && !isEngagementSuppressed('state_aware_nudge') && !suppressed) {
        const nudge = await evaluateStateAwareAfternoon(ctx, alreadySentTypes);
        if (nudge) qualified.push(nudge);
      }

      // P5: Evening Cool-Down
      if ((prefs?.evening_close_enabled ?? true) && !isEngagementSuppressed('evening_close') && !suppressed) {
        const nudge = await evaluateEveningClose(ctx, alreadySentTypes);
        if (nudge) qualified.push(nudge);
      }

      // P6: Pattern Alert
      if ((prefs?.pattern_alert_enabled ?? true) && !isEngagementSuppressed('pattern_alert') && !suppressed) {
        const nudge = await evaluatePatternAlert(ctx, alreadySentTypes, supabase);
        if (nudge) qualified.push(nudge);
      }

      // P7: Daily Fallback
      if (qualified.length === 0) {
        const nudge = await evaluateDailyFallback(ctx, alreadySentTypes, (todayLogs || []).length);
        if (nudge) qualified.push(nudge);
      }

      // ── Select best notification (priority order) ──
      qualified.sort((a, b) => a.priority - b.priority);

      if (qualified.length > 0) {
        // JIT (P1) always wins if present – even over suppression
        const jitNudge = qualified.find(n => n.type === 'pre_event_prep');
        const bestNudge = jitNudge || qualified[0];

        // If suppressed, only allow JIT through
        if (suppressed && !jitNudge) {
          console.log(`[smart-nudges] User ${userId} 2h-suppressed, no JIT. Skipping ${bestNudge.type}.`);
        } else {
          allNotifications.push({
            userId,
            type: bestNudge.type,
            copy: bestNudge.copy,
            eventReference: bestNudge.eventReference,
            tokens: userTokens.get(userId)!,
          });

          // Allow a second notification if morning + JIT both qualified
          if (!suppressed && qualified.length > 1) {
            const second = qualified.find(n => n !== bestNudge && (n.type === 'morning_prep' || n.type === 'pre_event_prep'));
            if (second && (todayLogs || []).length + allNotifications.filter(n => n.userId === userId).length < DAILY_NOTIFICATION_CAP) {
              allNotifications.push({
                userId,
                type: second.type,
                copy: second.copy,
                eventReference: second.eventReference,
                tokens: userTokens.get(userId)!,
              });
            }
          }
        }
      }
    }

    console.log(`[smart-nudges] ${allNotifications.length} notifications qualified`);

    // 4. Send notifications via APNs
    const apnsKey = Deno.env.get('APNS_P8_KEY');
    const apnsKeyId = Deno.env.get('APNS_KEY_ID');
    const apnsTeamId = Deno.env.get('APNS_TEAM_ID');
    const apnsBundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.moonshot.mindmoduleapp';
    const apnsEnv = Deno.env.get('APNS_ENVIRONMENT') || 'development';
    const apnsHost = apnsEnv === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
    const isDryRun = !apnsKey || !apnsKeyId || !apnsTeamId;

    if (isDryRun) {
      const missing = [
        !apnsKey && 'APNS_P8_KEY',
        !apnsKeyId && 'APNS_KEY_ID',
        !apnsTeamId && 'APNS_TEAM_ID',
      ].filter(Boolean);
      console.warn(`[smart-nudges] DRY RUN – missing secrets: ${missing.join(', ')}`);
    } else {
      console.log(`[smart-nudges] APNs config: host=${apnsHost} topic=${apnsBundleId} env=${apnsEnv}`);
    }

    let sendSuccess = 0;
    let sendFailed = 0;

    let apnsJwt: string | null = null;
    if (!isDryRun) {
      try {
        apnsJwt = await createApnsJwt(apnsKey!, apnsKeyId!, apnsTeamId!);
      } catch (e) {
        console.error('[smart-nudges] Failed to create APNs JWT:', e);
      }
    }

    // Deep link route mapping: nudge type → destination route
    const DEEP_LINK_ROUTES: Record<string, string> = {
      morning_prep: '/daily-check-in',
      pre_event_prep: '/executive-home',
      calendar_gap: '/daily-check-in',
      coach_meeting_match: '/self-mastery-coach',
      state_aware_nudge: '/executive-home',
      evening_close: '/daily-check-in',
      pattern_alert: '/insights',
      daily_fallback: '/executive-home',
    };

    for (const notif of allNotifications) {
      const effectiveRoute = DEEP_LINK_ROUTES[notif.type] || '/executive-home';

      const payload: Record<string, unknown> = {
        title: notif.copy.title,
        body: notif.copy.body,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        deep_link_route: effectiveRoute,
        dry_run: isDryRun,
        architecture: 'signal-first-v1',
      };

      if (notif.type === 'pattern_alert' && notif.eventReference) {
        payload.pattern_type = notif.eventReference;
      }

      const { data: logRow } = await supabase.from('notification_log').insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        event_reference: notif.eventReference || null,
        payload,
      }).select('id').single();

      const notificationLogId = logRow?.id;

      if (!isDryRun && apnsJwt) {
        for (const tokenInfo of notif.tokens) {
          if (tokenInfo.platform !== 'ios') continue;
          try {
            const sent = await sendApnsPush(
              tokenInfo.token,
              apnsJwt,
              apnsBundleId,
              notif.copy.title,
              notif.copy.body,
              {
                notification_type: notif.type,
                variant_id: notif.copy.variantId,
                notification_log_id: notificationLogId || '',
                deep_link_route: effectiveRoute,
              },
              apnsHost
            );
            if (sent) sendSuccess++;
            else sendFailed++;
          } catch (e) {
            console.error(`[smart-nudges] APNs send error for ${notif.userId}:`, e);
            sendFailed++;
          }
        }
      }

      console.log(`[smart-nudges] ${isDryRun ? 'DRY RUN' : 'SENT'}: ${notif.type}/${notif.copy.variantId} → ${notif.userId} | "${notif.copy.body}"`);
    }

    return new Response(JSON.stringify({
      processed: userIds.length,
      notifications: allNotifications.length,
      dry_run: isDryRun,
      apns_success: sendSuccess,
      apns_failed: sendFailed,
      architecture: 'signal-first-v1',
      details: allNotifications.map(n => ({
        user_id: n.userId,
        type: n.type,
        variant: n.copy.variantId,
        title: n.copy.title,
        body: n.copy.body,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[smart-nudges] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
