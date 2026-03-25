import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── APNs Helper Functions ──

/**
 * Create a JWT for APNs authentication using ES256 (ECDSA P-256 + SHA-256).
 * The P8 key is an ECDSA private key in PEM/PKCS8 format.
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
    console.error(`[APNs] Failed (${response.status}): ${errBody} — host=${apnsHost} topic=${bundleId} token=${deviceToken.substring(0, 12)}...`);
    if (response.status === 410 || response.status === 400) {
      console.log(`[APNs] Deactivating invalid token: ${deviceToken.substring(0, 12)}...`);
    }
    return false;
  }

  await response.text();
  console.log(`[APNs] Success — token=${deviceToken.substring(0, 12)}...`);
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Event priority scoring keywords ──
const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'negotiation', 'pitch',
  'review', 'performance', 'strategy', 'executive', 'stakeholder',
  'crisis', 'conflict', 'termination', 'layoff', 'restructure',
  'merger', 'acquisition', 'due diligence', 'fundraise', 'ipo',
  'media', 'press', 'interview', 'keynote', 'panel', 'town hall',
  'all-hands', 'offsite', 'retreat', 'workshop', 'training',
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

// ── Constants ──
const DAILY_NOTIFICATION_CAP = 4;
const LOW_TIERS = ['depleted', 'managing'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Copy Variants ──

interface Variant {
  id: string;
  title: string;
  body: string;
}

function getMorningVariants(ctx: {
  dayOfWeek: string;
  calendarPressure: string;
  streak: number;
  topEventTitle?: string;
  topEventTime?: string;
  morningLoad: string;
  afternoonLoad: string;
}): Variant[] {
  return [
    { id: 'MA-1', title: 'Your Compass is Ready', body: `Your ${ctx.dayOfWeek} is mapped. Check in to see your Compass.` },
    { id: 'MA-2', title: 'Ground First', body: `You have high-stakes events today. Ground first.` },
    { id: 'MA-3', title: 'Shape Your Day', body: 'Your readiness shapes the next 12 hours. Check in.' },
    { id: 'MA-4', title: 'Prep Session Ready', body: ctx.topEventTitle ? `${ctx.topEventTitle} is ${ctx.topEventTime || 'soon'}. Your prep session is ready.` : 'Your readiness shapes the next 12 hours. Check in.' },
    { id: 'MA-5', title: 'Keep the Rhythm', body: `Day ${ctx.streak} of your practice. Morning Practice ready.` },
    { id: 'MA-6', title: 'Start Strong', body: 'Clear morning, heavy afternoon. Start strong.' },
  ];
}

// ── Weekend Morning Variants ──
function getWeekendMorningVariants(): Variant[] {
  return [
    { id: 'MA-W1', title: 'Weekend Check-In', body: 'No calendar pressure today. Check in when you\'re ready.' },
    { id: 'MA-W2', title: 'Slower Pace', body: 'Weekend morning. A slower check-in for a different pace.' },
  ];
}

// ── Weekend Evening Variants ──
function getFridayEveningVariants(): Variant[] {
  return [
    { id: 'EC-F1', title: 'Week Complete', body: 'Week complete. What are you carrying into the weekend?' },
    { id: 'EC-F2', title: 'Close the Week', body: 'Five days behind you. Close the week before you unplug.' },
  ];
}

function getSaturdayEveningVariants(): Variant[] {
  return [
    { id: 'EC-W1', title: 'Saturday Close', body: 'No agenda tonight. Just notice how you\'re landing.' },
  ];
}

function getSundayEveningVariants(): Variant[] {
  return [
    { id: 'EC-S1', title: 'Week Ahead', body: 'Monday is mapped. Set your intention before the week begins.' },
    { id: 'EC-S2', title: 'Sunday Close', body: 'Sunday close. What do you want to carry into the new week?' },
  ];
}

function getPreEventVariants(ctx: {
  eventTitle: string;
  minutesUntil: number;
  innerTier: string;
  calendarLoad: string;
  eventCount: number;
  practiceName?: string;
  priorityScore: number;
}): Variant[] {
  return [
    { id: 'PE-1', title: 'Prep Ready', body: `${ctx.eventTitle} in ${ctx.minutesUntil} min. 3-min prep ready.` },
    { id: 'PE-2', title: 'Ground and Prepare', body: `${ctx.eventTitle} ahead. Ground and prepare now.` },
    { id: 'PE-3', title: "You're Well-Resourced", body: "You're well-resourced. Channel it." },
    { id: 'PE-4', title: 'Regulate First', body: "You're running low. Regulate before you engage." },
    { id: 'PE-5', title: 'Reset First', body: `${ctx.eventTitle} is your ${ctx.eventCount}${ordinalSuffix(ctx.eventCount)} meeting today. Reset first.` },
    { id: 'PE-6', title: 'High Stakes Prep', body: `High stakes, ${ctx.minutesUntil} min out. Your prep is ready.` },
  ];
}

function getEveningVariants(ctx: {
  dayOfWeek: string;
  calendarLoad: string;
  streak: number;
  hrvDeltaPct?: number;
  calendarPressure: string;
}): Variant[] {
  return [
    { id: 'EC-1', title: 'Evening Close', body: `Close your ${ctx.dayOfWeek}. Evening Practice ready.` },
    { id: 'EC-2', title: 'Release the Weight', body: `You carried a heavy schedule today. Release the weight.` },
    { id: 'EC-3', title: 'Log Your Win', body: 'Log your win. Close the day.' },
    { id: 'EC-4', title: 'Recovery Tonight', body: ctx.hrvDeltaPct ? `Your HRV dropped ${ctx.hrvDeltaPct}% today. Genuine recovery tonight protects tomorrow.` : 'Your body worked hard today. Genuine recovery tonight protects tomorrow.' },
    { id: 'EC-5', title: 'Evening Close', body: `Day ${ctx.streak}. Evening Close ready.` },
    { id: 'EC-6', title: 'Worth Carrying Forward', body: 'Heavy day behind you. What\'s worth carrying forward?' },
  ];
}

function getPatternAlertVariants(ctx: {
  patternType: string;
  tier?: string;
  consecutiveCount?: number;
  practiceName?: string;
  effectivenessRate?: number;
  streakDays?: number;
  eventType?: string;
  hrvDays?: number;
}): Variant[] {
  return [
    { id: 'PA-1', title: 'Pattern Noticed', body: `Day ${ctx.consecutiveCount || 3} at ${ctx.tier || 'low'}. Your system is showing a pattern worth noticing.` },
    { id: 'PA-2', title: 'What Works for You', body: `${ctx.practiceName || 'This practice'} works for you — ${ctx.effectivenessRate || 80}% followed by stronger days.` },
    { id: 'PA-3', title: 'Rhythm Forming', body: `${ctx.streakDays || 7} days. Your practice is becoming a rhythm.` },
    { id: 'PA-4', title: 'Pattern Worth Naming', body: `${ctx.eventType || 'These meetings'} consistently drain you. That pattern is worth naming.` },
    { id: 'PA-5', title: 'Recovery Priority', body: `Your HRV has been low for ${ctx.hrvDays || 3} days. Recovery is the priority.` },
  ];
}

function getStateAwareVariants(ctx: {
  highStakesCount: number;
  nextEventTitle?: string;
  minutesUntilNextEvent?: number;
  practiceName?: string;
}): Variant[] {
  return [
    { id: 'SN-1', title: 'Reset Available', body: `${ctx.highStakesCount} high-stakes events ahead. 5-min reset available now.` },
    { id: 'SN-2', title: 'Recalibrate', body: 'You started low. The afternoon is heavy. Recalibrate first.' },
    { id: 'SN-3', title: 'Afternoon Reset', body: `Afternoon Reset: ${ctx.practiceName || 'Quick reset'}. 3 min.` },
    { id: 'SN-4', title: 'Reset or Push Through', body: `${ctx.nextEventTitle || 'Next event'} in ${ctx.minutesUntilNextEvent || 90} min. Reset now or push through?` },
  ];
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Variant selection (round-robin) ──

function selectVariant(variants: Variant[], lastVariantId: string | null): Variant {
  if (!lastVariantId) return variants[0];
  const lastIdx = variants.findIndex(v => v.id === lastVariantId);
  const nextIdx = (lastIdx + 1) % variants.length;
  return variants[nextIdx];
}

// ── Day helpers ──

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
  return hour >= dndStart || hour < dndEnd; // wraps midnight
}

function isQuietDay(dayOfWeek: number, quietDays: number[] | null): boolean {
  if (!quietDays || quietDays.length === 0) return false;
  return quietDays.includes(dayOfWeek);
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
}

// ── Engagement-Based Learning (14-day feedback loop) ──

interface EngagementProfile {
  typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }>;
  suppressedTypes: string[]; // types with 0 taps in 5+ sends
}

async function getUserEngagementProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<EngagementProfile> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('notification_log')
    .select('notification_type, tapped')
    .eq('user_id', userId)
    .gte('sent_at', fourteenDaysAgo);

  const typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }> = {};

  for (const log of (logs || [])) {
    const t = log.notification_type;
    if (!typeEffectiveness[t]) typeEffectiveness[t] = { sent: 0, tapped: 0, rate: 0 };
    typeEffectiveness[t].sent++;
    if (log.tapped) typeEffectiveness[t].tapped++;
  }

  // Calculate rates and find suppressed types
  const suppressedTypes: string[] = [];
  for (const [type, stats] of Object.entries(typeEffectiveness)) {
    stats.rate = stats.sent > 0 ? stats.tapped / stats.sent : 0;
    // Suppress types sent 5+ times with 0 taps (50% reduction, not full suppression)
    if (stats.sent >= 5 && stats.tapped === 0) {
      suppressedTypes.push(type);
    }
  }

  return { typeEffectiveness, suppressedTypes };
}

// ── Type Diversity: 3-day lookback ──

async function getTypeFrequencyMap(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Map<string, number>> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('notification_log')
    .select('notification_type')
    .eq('user_id', userId)
    .gte('sent_at', threeDaysAgo);

  const freq = new Map<string, number>();
  for (const log of (logs || [])) {
    freq.set(log.notification_type, (freq.get(log.notification_type) || 0) + 1);
  }
  return freq;
}

// ── Time-of-Day Priority Shifting ──
// Returns priority order based on current time window.
// Lower index = higher priority.

function getTimePriority(localHour: number): string[] {
  if (localHour >= 6 && localHour < 11) {
    // Morning: Morning Anchor is most contextual, then Pre-Event, then Pattern
    return ['morning_anchor', 'pre_event_prep', 'pattern_alert', 'afternoon_checkin', 'evening_close', 'state_aware_nudge', 'daily_fallback'];
  }
  if (localHour >= 11 && localHour < 15) {
    // Midday: Pre-Event is most urgent, then State-Aware, then Afternoon
    return ['pre_event_prep', 'state_aware_nudge', 'afternoon_checkin', 'pattern_alert', 'morning_anchor', 'evening_close', 'daily_fallback'];
  }
  if (localHour >= 18 && localHour < 22) {
    // Evening: Evening Close is most contextual, then Pattern, then Pre-Event
    return ['evening_close', 'pattern_alert', 'pre_event_prep', 'state_aware_nudge', 'morning_anchor', 'afternoon_checkin', 'daily_fallback'];
  }
  // Default (15-18, 22+): Pre-Event > Pattern > Fallback
  return ['pre_event_prep', 'pattern_alert', 'daily_fallback', 'morning_anchor', 'afternoon_checkin', 'evening_close', 'state_aware_nudge'];
}

// ── Diversity-aware sort ──
// When multiple notifications qualify, prefer least-recently-sent type.
// Pre-Event always wins within its 30-90 min trigger window.

function diversitySort(
  notifications: Array<{ type: string }>,
  typeFrequency: Map<string, number>,
  timePriority: string[],
  engagementProfile: EngagementProfile
): void {
  notifications.sort((a, b) => {
    // Pre-Event always wins (time-critical)
    if (a.type === 'pre_event_prep' && b.type !== 'pre_event_prep') return -1;
    if (b.type === 'pre_event_prep' && a.type !== 'pre_event_prep') return 1;

    // Check diversity: types not sent in 3 days get a boost
    const aFreq = typeFrequency.get(a.type) || 0;
    const bFreq = typeFrequency.get(b.type) || 0;
    const aDiversityBoost = aFreq === 0 ? -10 : 0;
    const bDiversityBoost = bFreq === 0 ? -10 : 0;

    // Check engagement: effective types get a small boost
    const aRate = engagementProfile.typeEffectiveness[a.type]?.rate || 0;
    const bRate = engagementProfile.typeEffectiveness[b.type]?.rate || 0;
    const aEngagementBoost = aRate > 0.5 ? -5 : 0;
    const bEngagementBoost = bRate > 0.5 ? -5 : 0;

    // Base priority from time-of-day
    const aPriority = timePriority.indexOf(a.type);
    const bPriority = timePriority.indexOf(b.type);

    const aScore = aPriority + aDiversityBoost + aEngagementBoost;
    const bScore = bPriority + bDiversityBoost + bEngagementBoost;

    return aScore - bScore;
  });
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[smart-nudges] Starting evaluation run...');

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
    console.log(`[smart-nudges] Evaluating ${userIds.length} users`);

    // 2. Batch-fetch all needed data
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

    // Build map of last app_open per user
    const lastAppOpenMap = new Map<string, Date>();
    for (const eng of (recentEngagements || [])) {
      const ts = new Date(eng.timestamp);
      const existing = lastAppOpenMap.get(eng.user_id);
      if (!existing || ts > existing) lastAppOpenMap.set(eng.user_id, ts);
    }

    const allNotifications: Array<{
      userId: string;
      type: string;
      variant: Variant;
      eventReference?: string;
      tokens: Array<{ token: string; platform: string }>;
      suppressionReason?: string;
    }> = [];

    // 3. Evaluate each user
    for (const userId of userIds) {
      const profile = profileMap.get(userId);
      const prefs = prefMap.get(userId);
      const tzOffset = profile?.timezone_offset ?? 0;
      const localDate = getUserLocalDate(tzOffset);
      const localHour = localDate.getHours();
      const localMinute = localDate.getMinutes();
      const localTime = localHour + localMinute / 60;
      const dayOfWeek = localDate.getDay();
      const todayStr = toDateString(localDate);
      const dayName = DAYS[dayOfWeek];
      const weekend = isWeekend(dayOfWeek);

      // DND / quiet day check
      const dndStart = prefs?.dnd_start ?? null;
      const dndEnd = prefs?.dnd_end ?? null;
      if (isInDND(localHour, dndStart, dndEnd)) continue;
      if (isQuietDay(dayOfWeek, prefs?.quiet_days ?? null)) continue;

      // Convert local midnight to UTC for timezone-aware log queries
      const localMidnightMs = new Date(`${todayStr}T00:00:00`).getTime();
      const todayStartUtc = new Date(localMidnightMs - tzOffset * 60000).toISOString();
      const todayEndUtc = new Date(localMidnightMs - tzOffset * 60000 + 24 * 60 * 60 * 1000).toISOString();

      // Fetch today's notification log using timezone-corrected UTC boundaries
      const { data: todayLogs } = await supabase
        .from('notification_log')
        .select('notification_type, variant_id, sent_at, event_reference')
        .eq('user_id', userId)
        .gte('sent_at', todayStartUtc)
        .lt('sent_at', todayEndUtc)
        .order('sent_at', { ascending: false });

      // ── DAILY CAP: max 4 notifications per user per day ──
      if (todayLogs && todayLogs.length >= DAILY_NOTIFICATION_CAP) {
        console.log(`[smart-nudges] User ${userId} hit daily cap (${todayLogs.length}/${DAILY_NOTIFICATION_CAP}). Skipping.`);
        continue;
      }

      const logsByType = new Map<string, typeof todayLogs>();
      for (const log of (todayLogs || [])) {
        if (!logsByType.has(log.notification_type)) logsByType.set(log.notification_type, []);
        logsByType.get(log.notification_type)!.push(log);
      }

      // 2-hour suppression: query recent logs independently (handles midnight crossover)
      const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('notification_log')
        .select('sent_at')
        .eq('user_id', userId)
        .gte('sent_at', twoHoursAgoIso)
        .order('sent_at', { ascending: false })
        .limit(1);

      const lastSentAt = recentLogs && recentLogs.length > 0 ? new Date(recentLogs[0].sent_at) : null;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const suppressed = lastSentAt && lastSentAt > twoHoursAgo;

      // ── Engagement profile + type diversity (fetched per user) ──
      const [engagementProfile, typeFrequency] = await Promise.all([
        getUserEngagementProfile(supabase, userId),
        getTypeFrequencyMap(supabase, userId),
      ]);

      const userNotifications: typeof allNotifications = [];

      // Helper: should this type be suppressed by engagement learning?
      // Types with 0 taps in 5+ sends get 50% reduction (skip every other time)
      function isEngagementSuppressed(type: string): boolean {
        if (!engagementProfile.suppressedTypes.includes(type)) return false;
        // Use a simple hash to get consistent 50% suppression per user+type+day
        const hash = (userId + type + todayStr).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return hash % 2 === 0;
      }

      // ── Pre-Event Prep (always highest time-critical priority) ──
      if ((prefs?.pre_event_prep_enabled ?? true) && !suppressed && !isEngagementSuppressed('pre_event_prep')) {
        const preEventCount = (logsByType.get('pre_event_prep') || []).length;
        if (preEventCount < 3) {
          const now = new Date();
          const min30 = new Date(now.getTime() + 30 * 60000);
          const min90 = new Date(now.getTime() + 90 * 60000);

          const { data: upcomingEvents } = await supabase
            .from('calendar_events')
            .select('id, title, start_time, external_id')
            .eq('user_id', userId)
            .gte('start_time', min30.toISOString())
            .lte('start_time', min90.toISOString())
            .order('start_time', { ascending: true });

          for (const evt of (upcomingEvents || [])) {
            const score = scoreEvent(evt.title);
            if (score < 25) continue;

            const alreadySent = (logsByType.get('pre_event_prep') || [])
              .some(l => l.event_reference === evt.external_id);
            if (alreadySent) continue;

            const { data: latestCheckin } = await supabase
              .from('daily_checkins')
              .select('outcome')
              .eq('user_id', userId)
              .eq('checkin_date', todayStr)
              .limit(1)
              .single();

            const minutesUntil = Math.round((new Date(evt.start_time).getTime() - now.getTime()) / 60000);
            const innerTier = latestCheckin?.outcome || 'unknown';

            const { count: todayEventCount } = await supabase
              .from('calendar_events')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .gte('start_time', `${todayStr}T00:00:00`)
              .lte('start_time', `${todayStr}T23:59:59`);

            const variants = getPreEventVariants({
              eventTitle: evt.title || 'Upcoming event',
              minutesUntil,
              innerTier,
              calendarLoad: (todayEventCount || 0) > 5 ? 'high' : 'moderate',
              eventCount: (todayEventCount || 0),
              priorityScore: score,
            });

            let selectedVariant: Variant;
            if (innerTier === 'strong' || innerTier === 'peak') {
              selectedVariant = variants[2]; // PE-3
            } else if (innerTier === 'depleted' || innerTier === 'managing') {
              selectedVariant = variants[3]; // PE-4
            } else {
              const lastVariant = (logsByType.get('pre_event_prep') || [])[0]?.variant_id || null;
              selectedVariant = selectVariant(variants, lastVariant);
            }

            userNotifications.push({
              userId,
              type: 'pre_event_prep',
              variant: selectedVariant,
              eventReference: evt.external_id,
              tokens: userTokens.get(userId)!,
            });
            break;
          }
        }
      }

      // ── Pattern Alert ──
      if (
        (prefs?.pattern_alert_enabled ?? true) &&
        !suppressed &&
        !isEngagementSuppressed('pattern_alert') &&
        !(logsByType.get('pattern_alert')?.length)
      ) {
        const lastAppOpen = lastAppOpenMap.get(userId);
        const appOpenedRecently = lastAppOpen && lastAppOpen > new Date(Date.now() - 4 * 60 * 60 * 1000);

        if (!appOpenedRecently) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentPatternLogs } = await supabase
            .from('notification_log')
            .select('variant_id, payload')
            .eq('user_id', userId)
            .eq('notification_type', 'pattern_alert')
            .gte('sent_at', sevenDaysAgo);

          const recentPatternTypes = new Set(
            (recentPatternLogs || []).map(l => {
              const p = l.payload as Record<string, unknown>;
              return (p?.pattern_type as string) || l.variant_id;
            })
          );

          let patternVariant: Variant | null = null;
          let patternType: string | null = null;

          // --- Pattern 1: Consecutive low state (3 days) ---
          if (!patternVariant && !recentPatternTypes.has('consecutive_low')) {
            const { data: recentCheckins } = await supabase
              .from('daily_checkins')
              .select('outcome, checkin_date')
              .eq('user_id', userId)
              .order('checkin_date', { ascending: false })
              .limit(3);

            if (
              recentCheckins && recentCheckins.length >= 3 &&
              recentCheckins.every(c => LOW_TIERS.includes(c.outcome))
            ) {
              const tier = recentCheckins[0].outcome;
              const variants = getPatternAlertVariants({
                patternType: 'consecutive_low',
                tier,
                consecutiveCount: 3,
              });
              patternVariant = variants[0];
              patternType = 'consecutive_low';
            }
          }

          // --- Pattern 2: Effectiveness milestone ---
          if (!patternVariant && !recentPatternTypes.has('effectiveness_milestone')) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: practiceSessions } = await supabase
              .from('practice_sessions')
              .select('content_id, effectiveness_rating')
              .eq('user_id', userId)
              .eq('completed', true)
              .not('effectiveness_rating', 'is', null)
              .gte('created_at', thirtyDaysAgo);

            if (practiceSessions && practiceSessions.length > 0) {
              const byContent = new Map<string, number[]>();
              for (const ps of practiceSessions) {
                if (!byContent.has(ps.content_id)) byContent.set(ps.content_id, []);
                byContent.get(ps.content_id)!.push(ps.effectiveness_rating);
              }

              for (const [contentId, ratings] of byContent) {
                if (ratings.length >= 5) {
                  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                  if (avg >= 4.0) {
                    const { data: content } = await supabase
                      .from('sanctuary_content')
                      .select('title')
                      .eq('id', contentId)
                      .limit(1)
                      .single();

                    const variants = getPatternAlertVariants({
                      patternType: 'effectiveness_milestone',
                      practiceName: content?.title || 'This practice',
                      effectivenessRate: Math.round(avg / 5 * 100),
                    });
                    patternVariant = variants[1];
                    patternType = 'effectiveness_milestone';
                    break;
                  }
                }
              }
            }
          }

          // --- Pattern 3: Streak milestone (7, 14, 30 days) ---
          if (!patternVariant && !recentPatternTypes.has('streak_milestone')) {
            const streak = profile?.current_streak || 0;
            const milestones = [30, 14, 7];
            for (const milestone of milestones) {
              if (streak === milestone) {
                const variants = getPatternAlertVariants({
                  patternType: 'streak_milestone',
                  streakDays: milestone,
                });
                patternVariant = variants[2];
                patternType = 'streak_milestone';
                break;
              }
            }
          }

          // --- Pattern 4: Calendar correlation ---
          if (!patternVariant && !recentPatternTypes.has('calendar_correlation')) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const { data: classifications } = await supabase
              .from('calendar_event_classifications')
              .select('event_type, calendar_event_id, created_at')
              .eq('user_id', userId)
              .gte('created_at', thirtyDaysAgo);

            if (classifications && classifications.length > 0) {
              const { data: checkins } = await supabase
                .from('daily_checkins')
                .select('checkin_date, outcome')
                .eq('user_id', userId)
                .gte('checkin_date', thirtyDaysAgo.split('T')[0]);

              if (checkins && checkins.length > 0) {
                const lowDays = new Set(
                  checkins.filter(c => LOW_TIERS.includes(c.outcome)).map(c => c.checkin_date)
                );

                const eventTypeCounts = new Map<string, number>();
                for (const cls of classifications) {
                  const eventDate = cls.created_at.split('T')[0];
                  if (lowDays.has(eventDate)) {
                    eventTypeCounts.set(cls.event_type, (eventTypeCounts.get(cls.event_type) || 0) + 1);
                  }
                }

                for (const [eventType, count] of eventTypeCounts) {
                  if (count >= 5) {
                    const variants = getPatternAlertVariants({
                      patternType: 'calendar_correlation',
                      eventType: eventType.charAt(0).toUpperCase() + eventType.slice(1) + ' meetings',
                    });
                    patternVariant = variants[3];
                    patternType = 'calendar_correlation';
                    break;
                  }
                }
              }
            }
          }

          // --- Pattern 5: Recovery deficit ---
          if (!patternVariant && !recentPatternTypes.has('recovery_deficit')) {
            const { data: recentSnapshots } = await supabase
              .from('energy_snapshots')
              .select('snapshot_date, oura_readiness, computed_data')
              .eq('user_id', userId)
              .order('snapshot_date', { ascending: false })
              .limit(3);

            if (recentSnapshots && recentSnapshots.length >= 3) {
              const allLowHrv = recentSnapshots.every(snap => {
                const computed = snap.computed_data as Record<string, unknown> | null;
                const hrvDelta = computed?.hrv_delta_pct as number | undefined;
                return hrvDelta !== undefined && hrvDelta <= -20;
              });

              if (allLowHrv) {
                const variants = getPatternAlertVariants({
                  patternType: 'recovery_deficit',
                  hrvDays: 3,
                });
                patternVariant = variants[4];
                patternType = 'recovery_deficit';
              }
            }
          }

          if (patternVariant && patternType) {
            userNotifications.push({
              userId,
              type: 'pattern_alert',
              variant: patternVariant,
              tokens: userTokens.get(userId)!,
              eventReference: patternType,
            });
          }
        }
      }

      // ── Morning Anchor ──
      // Weekend: shifted windows (Sat 7:30-10:00, Sun 8:00-10:30)
      let morningStart = prefs?.morning_window_start ?? 6;
      let morningEnd = prefs?.morning_window_end ?? 9;
      if (dayOfWeek === 6) { // Saturday
        morningStart = Math.max(morningStart, 7.5);
        morningEnd = Math.max(morningEnd, 10);
      } else if (dayOfWeek === 0) { // Sunday
        morningStart = Math.max(morningStart, 8);
        morningEnd = Math.max(morningEnd, 10.5);
      }

      if (
        (prefs?.morning_anchor_enabled ?? true) &&
        !isEngagementSuppressed('morning_anchor') &&
        localTime >= morningStart && localTime < morningEnd - 0.5 &&
        !(logsByType.get('morning_anchor')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        const { data: todayCheckin } = await supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', todayStr)
          .limit(1);

        if (!todayCheckin || todayCheckin.length === 0) {
          const { count: eventCount } = await supabase
            .from('calendar_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('start_time', `${todayStr}T00:00:00`)
            .lte('start_time', `${todayStr}T23:59:59`);

          const calendarPressure = (eventCount || 0) > 5 ? 'high' : (eventCount || 0) > 2 ? 'moderate' : 'low';
          const streak = profile?.current_streak || 0;

          let selectedVariant: Variant;

          // Weekend: use weekend variants when calendar is not high
          if (weekend && calendarPressure !== 'high') {
            const weekendVariants = getWeekendMorningVariants();
            const lastVariant = (logsByType.get('morning_anchor') || [])[0]?.variant_id || null;
            selectedVariant = selectVariant(weekendVariants, lastVariant);
          } else {
            const variants = getMorningVariants({
              dayOfWeek: dayName,
              calendarPressure,
              streak,
              morningLoad: 'moderate',
              afternoonLoad: 'moderate',
            });

            if (calendarPressure === 'high') {
              selectedVariant = variants[1]; // MA-2
            } else if (streak >= 3) {
              selectedVariant = variants[4]; // MA-5
            } else {
              const lastVariant = (logsByType.get('morning_anchor') || [])[0]?.variant_id || null;
              selectedVariant = selectVariant(variants, lastVariant);
            }
          }

          userNotifications.push({
            userId,
            type: 'morning_anchor',
            variant: selectedVariant,
            tokens: userTokens.get(userId)!,
          });
        }
      }

      // ── Afternoon Check-In ──
      // SKIP on weekends — no structured afternoon work
      if (
        !weekend &&
        !isEngagementSuppressed('afternoon_checkin') &&
        localTime >= 12.5 && localTime < 14.5 &&
        !(logsByType.get('afternoon_checkin')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        const { data: afternoonCheckin } = await supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', todayStr)
          .eq('time_window', 'afternoon')
          .limit(1);

        if (!afternoonCheckin || afternoonCheckin.length === 0) {
          const afternoonVariants: Variant[] = [
            { id: 'AC-1', title: 'Midday Reset', body: 'Halfway through — how are you holding up? A quick check-in recalibrates the rest of your day.' },
            { id: 'AC-2', title: 'Afternoon Pulse', body: 'Your morning self set the tone. Your afternoon self steers the ship. Check in now.' },
            { id: 'AC-3', title: 'Quick Recalibration', body: 'Before the afternoon stacks up — 30 seconds to notice where your energy sits.' },
          ];
          const lastAfternoon = (logsByType.get('afternoon_checkin') || [])[0]?.variant_id || null;
          const selectedAfternoon = selectVariant(afternoonVariants, lastAfternoon);
          userNotifications.push({
            userId,
            type: 'afternoon_checkin',
            variant: selectedAfternoon,
            tokens: userTokens.get(userId)!,
          });
        }
      }

      // ── Evening Close ──
      // Weekend: use day-specific variants (Fri close-the-week, Sat unwind, Sun week-prep)
      const eveningStart = prefs?.evening_window_start ?? 19;
      let eveningEnd = prefs?.evening_window_end ?? 22;
      // Sunday evening: extended window for week-prep (18:00-22:00)
      if (dayOfWeek === 0) {
        eveningEnd = Math.max(eveningEnd, 22);
      }

      if (
        (prefs?.evening_close_enabled ?? true) &&
        !isEngagementSuppressed('evening_close') &&
        localTime >= eveningStart && localTime < eveningEnd - 0.5 &&
        !(logsByType.get('evening_close')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        const { data: todayRitual } = await supabase
          .from('daily_ritual_completions')
          .select('id, session_period')
          .eq('user_id', userId)
          .eq('ritual_date', todayStr)
          .eq('session_period', 'evening')
          .limit(1);

        const { data: eveningCheckin } = await supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', todayStr)
          .eq('time_window', 'evening')
          .limit(1);

        const noEveningRitual = !todayRitual || todayRitual.length === 0;
        const noEveningCheckin = !eveningCheckin || eveningCheckin.length === 0;

        if (noEveningRitual || noEveningCheckin) {
          // Weekend-specific evening variants
          let variants: Variant[];
          let selectedVariant: Variant;

          if (dayOfWeek === 5) {
            // Friday evening: close-the-week variants
            variants = getFridayEveningVariants();
            const lastVariant = (logsByType.get('evening_close') || [])[0]?.variant_id || null;
            selectedVariant = selectVariant(variants, lastVariant);
          } else if (dayOfWeek === 6) {
            // Saturday evening: unwind variants
            variants = getSaturdayEveningVariants();
            selectedVariant = variants[0]; // Only one variant
          } else if (dayOfWeek === 0) {
            // Sunday evening: week-prep variants
            variants = getSundayEveningVariants();
            const lastVariant = (logsByType.get('evening_close') || [])[0]?.variant_id || null;
            selectedVariant = selectVariant(variants, lastVariant);
          } else if (noEveningCheckin) {
            // Weekday: evening check-in variants
            variants = [
              { id: 'ECI-1', title: 'Evening Check-In', body: 'Before you wind down — how did you show up today? A quick check-in closes the loop.' },
              { id: 'ECI-2', title: 'End-of-Day Pulse', body: 'Your evening self has wisdom your morning self didn\'t. Capture it in 30 seconds.' },
            ];
            const lastVariant = (logsByType.get('evening_close') || [])[0]?.variant_id || null;
            selectedVariant = selectVariant(variants, lastVariant);
          } else {
            // Weekday: evening ritual variants with context
            const { count: eventCount } = await supabase
              .from('calendar_events')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .gte('start_time', `${todayStr}T00:00:00`)
              .lte('start_time', `${todayStr}T23:59:59`);

            const calendarLoad = (eventCount || 0) > 5 ? 'high' : 'moderate';
            const streak = profile?.current_streak || 0;

            const { data: energySnap } = await supabase
              .from('energy_snapshots')
              .select('oura_readiness, computed_data')
              .eq('user_id', userId)
              .eq('snapshot_date', todayStr)
              .limit(1)
              .single();

            const hrvDeltaPct = energySnap?.computed_data?.hrv_delta_pct as number | undefined;

            variants = getEveningVariants({
              dayOfWeek: dayName,
              calendarLoad,
              streak,
              hrvDeltaPct: hrvDeltaPct ? Math.round(Math.abs(hrvDeltaPct)) : undefined,
              calendarPressure: calendarLoad,
            });

            if (hrvDeltaPct && Math.abs(hrvDeltaPct) >= 15) {
              selectedVariant = variants[3]; // EC-4
            } else if (calendarLoad === 'high') {
              selectedVariant = variants[1]; // EC-2
            } else if (streak >= 3) {
              selectedVariant = variants[4]; // EC-5
            } else {
              const lastVariant = (logsByType.get('evening_close') || [])[0]?.variant_id || null;
              selectedVariant = selectVariant(variants, lastVariant);
            }
          }

          userNotifications.push({
            userId,
            type: 'evening_close',
            variant: selectedVariant,
            tokens: userTokens.get(userId)!,
          });
        }
      }

      // ── State-Aware Nudge ──
      // SKIP on weekends — requires structured calendar pressure
      if (
        !weekend &&
        (prefs?.state_aware_nudge_enabled ?? true) &&
        !isEngagementSuppressed('state_aware_nudge') &&
        localTime >= 12 && localTime < 15 &&
        !(logsByType.get('state_aware_nudge')?.length)
      ) {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const strictSuppressed = lastSentAt && lastSentAt > threeHoursAgo;

        if (!strictSuppressed && userNotifications.length === 0) {
          const lastAppOpen = lastAppOpenMap.get(userId);
          const appOpenedIn3h = lastAppOpen && lastAppOpen > threeHoursAgo;

          if (!appOpenedIn3h) {
            const { data: morningCheckin } = await supabase
              .from('daily_checkins')
              .select('outcome')
              .eq('user_id', userId)
              .eq('checkin_date', todayStr)
              .limit(1)
              .single();

            if (morningCheckin && LOW_TIERS.includes(morningCheckin.outcome)) {
              const { data: afternoonReset } = await supabase
                .from('daily_ritual_completions')
                .select('id')
                .eq('user_id', userId)
                .eq('ritual_date', todayStr)
                .eq('session_period', 'afternoon')
                .limit(1);

              if (!afternoonReset || afternoonReset.length === 0) {
                const now = new Date();
                const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

                const { data: afternoonEvents } = await supabase
                  .from('calendar_events')
                  .select('id, title, start_time')
                  .eq('user_id', userId)
                  .gte('start_time', now.toISOString())
                  .lte('start_time', fourHoursLater.toISOString())
                  .order('start_time', { ascending: true });

                const highStakesEvents = (afternoonEvents || []).filter(e => scoreEvent(e.title) >= 25);

                if (highStakesEvents.length >= 1) {
                  const min60 = new Date(now.getTime() + 60 * 60000);
                  const min120 = new Date(now.getTime() + 120 * 60000);
                  const nearEvent = highStakesEvents.find(e => {
                    const start = new Date(e.start_time);
                    return start >= min60 && start <= min120;
                  });

                  const variants = getStateAwareVariants({
                    highStakesCount: highStakesEvents.length,
                    nextEventTitle: nearEvent?.title || undefined,
                    minutesUntilNextEvent: nearEvent
                      ? Math.round((new Date(nearEvent.start_time).getTime() - now.getTime()) / 60000)
                      : undefined,
                  });

                  let selectedVariant: Variant;
                  if (nearEvent) {
                    selectedVariant = variants[3]; // SN-4
                  } else if (highStakesEvents.length >= 3) {
                    selectedVariant = variants[0]; // SN-1
                  } else {
                    selectedVariant = variants[1]; // SN-2
                  }

                  userNotifications.push({
                    userId,
                    type: 'state_aware_nudge',
                    variant: selectedVariant,
                    tokens: userTokens.get(userId)!,
                  });
                }
              }
            }
          }
        }
      }

      // ── Daily Fallback ──
      if (
        userNotifications.length === 0 &&
        localTime >= 10 && localTime < 12 &&
        (!todayLogs || todayLogs.length === 0)
      ) {
        const fallbackVariants: Variant[] = [
          { id: 'FB-1', title: 'Your Day Awaits', body: 'Take 30 seconds to check in. Your Compass is ready.' },
          { id: 'FB-2', title: 'Quick Check-In', body: 'How are you showing up today? A moment of awareness changes everything.' },
          { id: 'FB-3', title: 'Pause & Notice', body: 'Before the day runs you — pause and notice where you are.' },
        ];
        const lastFallback = (logsByType.get('daily_fallback') || [])[0]?.variant_id || null;
        const selectedFallback = selectVariant(fallbackVariants, lastFallback);
        userNotifications.push({
          userId,
          type: 'daily_fallback',
          variant: selectedFallback,
          tokens: userTokens.get(userId)!,
        });
      }

      // ── Final selection: diversity-aware priority sort ──
      if (userNotifications.length > 1) {
        const timePriority = getTimePriority(localHour);
        diversitySort(userNotifications, typeFrequency, timePriority, engagementProfile);

        if (suppressed) {
          // Only keep highest-priority notification when suppressed
          allNotifications.push(userNotifications[0]);
        } else {
          // Allow Morning Anchor + Pre-Event Prep to coexist
          allNotifications.push(...userNotifications);
        }
      } else {
        allNotifications.push(...userNotifications);
      }
    }

    console.log(`[smart-nudges] ${allNotifications.length} notifications qualified`);

    // 4. Send notifications via APNs (or dry-run if credentials not configured)
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
      console.warn(`[smart-nudges] DRY RUN — missing secrets: ${missing.join(', ')}`);
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

    for (const notif of allNotifications) {
      const payload: Record<string, unknown> = {
        title: notif.variant.title,
        body: notif.variant.body,
        notification_type: notif.type,
        variant_id: notif.variant.id,
        dry_run: isDryRun,
      };

      if (notif.type === 'pattern_alert' && notif.eventReference) {
        payload.pattern_type = notif.eventReference;
      }

      // Log suppression reason if present
      if (notif.suppressionReason) {
        payload.suppression_note = notif.suppressionReason;
      }

      const { data: logRow } = await supabase.from('notification_log').insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.variant.id,
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
              notif.variant.title,
              notif.variant.body,
              {
                notification_type: notif.type,
                variant_id: notif.variant.id,
                notification_log_id: notificationLogId || '',
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

      console.log(`[smart-nudges] ${isDryRun ? 'DRY RUN' : 'SENT'}: ${notif.type}/${notif.variant.id} → ${notif.userId}`);
    }

    return new Response(JSON.stringify({
      processed: userIds.length,
      notifications: allNotifications.length,
      dry_run: isDryRun,
      apns_success: sendSuccess,
      apns_failed: sendFailed,
      details: allNotifications.map(n => ({
        user_id: n.userId,
        type: n.type,
        variant: n.variant.id,
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
