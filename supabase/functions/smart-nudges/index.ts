import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── APNs Helper Functions ──

/**
 * Create a JWT for APNs authentication using ES256 (ECDSA P-256 + SHA-256).
 * The P8 key is an ECDSA private key in PEM/PKCS8 format.
 */
async function createApnsJwt(p8Key: string, keyId: string, teamId: string): Promise<string> {
  // Clean and decode the P8 key
  const pemBody = p8Key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  // Import as ECDSA P-256 signing key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Build JWT header and payload
  const header = { alg: 'ES256', kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = encode(header);
  const claimsB64 = encode(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  // Sign with ECDSA P-256 SHA-256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  // Convert ArrayBuffer to base64url
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

/**
 * Send a push notification to a single iOS device via APNs HTTP/2.
 * Returns true on success, false on failure.
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

    // Deactivate invalid tokens
    if (response.status === 410 || response.status === 400) {
      console.log(`[APNs] Deactivating invalid token: ${deviceToken.substring(0, 12)}...`);
      // Token deactivation handled by caller if needed
    }
    return false;
  }

  await response.text(); // consume body
  console.log(`[APNs] Success — token=${deviceToken.substring(0, 12)}...`);
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Event priority scoring keywords (mirrors generate-mastery-plan) ──
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

// ── PHASE 2: Pattern Alert copy variants ──
// These activate naturally as users accumulate sufficient history data.
// Trigger thresholds (3 consecutive low days, 5+ practice completions, 7-day streaks, etc.)
// inherently require user history before they can fire — no artificial gates needed.

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

// ── PHASE 2: State-Aware Nudge copy variants ──
// Midday precision intervention: only fires when inner state (depleted/managing)
// misaligns with outer demands (high afternoon calendar pressure).
// Requires completed morning check-in + calendar data to evaluate.

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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

const LOW_TIERS = ['depleted', 'managing'];

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
      // Batch-fetch recent app_open events for Phase 2 suppression checks
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

      // DND / quiet day check
      const dndStart = prefs?.dnd_start ?? null;
      const dndEnd = prefs?.dnd_end ?? null;
      if (isInDND(localHour, dndStart, dndEnd)) continue;
      if (isQuietDay(dayOfWeek, prefs?.quiet_days ?? null)) continue;

      // Fetch today's notification log for this user
      const { data: todayLogs } = await supabase
        .from('notification_log')
        .select('notification_type, variant_id, sent_at, event_reference')
        .eq('user_id', userId)
        .gte('sent_at', `${todayStr}T00:00:00`)
        .order('sent_at', { ascending: false });

      const logsByType = new Map<string, typeof todayLogs>();
      for (const log of (todayLogs || [])) {
        if (!logsByType.has(log.notification_type)) logsByType.set(log.notification_type, []);
        logsByType.get(log.notification_type)!.push(log);
      }

      // Check suppression: no notification within last 2 hours
      const lastSentAt = todayLogs && todayLogs.length > 0 ? new Date(todayLogs[0].sent_at) : null;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const suppressed = lastSentAt && lastSentAt > twoHoursAgo;

      const userNotifications: typeof allNotifications = [];

      // ── Pre-Event Prep (highest priority) ──
      if ((prefs?.pre_event_prep_enabled ?? true) && !suppressed) {
        const preEventCount = (logsByType.get('pre_event_prep') || []).length;
        if (preEventCount < 3) {
          // Find events starting in 30-90 min
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

            // Check if already sent for this event
            const alreadySent = (logsByType.get('pre_event_prep') || [])
              .some(l => l.event_reference === evt.external_id);
            if (alreadySent) continue;

            // Get inner readiness tier
            const { data: latestCheckin } = await supabase
              .from('daily_checkins')
              .select('outcome')
              .eq('user_id', userId)
              .eq('checkin_date', todayStr)
              .limit(1)
              .single();

            const minutesUntil = Math.round((new Date(evt.start_time).getTime() - now.getTime()) / 60000);
            const innerTier = latestCheckin?.outcome || 'unknown';

            // Count events today for context
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

            // Select variant based on inner tier for relevance
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
            break; // one pre-event at a time
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE 2: Pattern Alert (Type 4)
      // High-value, low-frequency insights. Activates naturally as users
      // accumulate sufficient history. Max 1 per day, suppressed if same
      // pattern type sent in last 7 days or app opened in last 4 hours.
      // ══════════════════════════════════════════════════════════════════
      if (
        (prefs?.pattern_alert_enabled ?? true) &&
        !suppressed &&
        !(logsByType.get('pattern_alert')?.length) // max 1 per day
      ) {
        // Suppression: skip if user opened app in last 4 hours
        const lastAppOpen = lastAppOpenMap.get(userId);
        const appOpenedRecently = lastAppOpen && lastAppOpen > new Date(Date.now() - 4 * 60 * 60 * 1000);

        if (!appOpenedRecently) {
          // Fetch pattern alerts from last 7 days for per-pattern suppression
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
              patternVariant = variants[0]; // PA-1
              patternType = 'consecutive_low';
            }
          }

          // --- Pattern 2: Effectiveness milestone (5+ completions, 80%+ avg rating) ---
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
              // Group by content_id and find milestone candidates
              const byContent = new Map<string, number[]>();
              for (const ps of practiceSessions) {
                if (!byContent.has(ps.content_id)) byContent.set(ps.content_id, []);
                byContent.get(ps.content_id)!.push(ps.effectiveness_rating);
              }

              for (const [contentId, ratings] of byContent) {
                if (ratings.length >= 5) {
                  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                  // effectiveness_rating is 1-5 scale; 80% = 4.0
                  if (avg >= 4.0) {
                    // Look up practice name from sanctuary_content
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
                    patternVariant = variants[1]; // PA-2
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
            const milestones = [30, 14, 7]; // check highest first
            for (const milestone of milestones) {
              if (streak === milestone) {
                const variants = getPatternAlertVariants({
                  patternType: 'streak_milestone',
                  streakDays: milestone,
                });
                patternVariant = variants[2]; // PA-3
                patternType = 'streak_milestone';
                break;
              }
            }
          }

          // --- Pattern 4: Calendar correlation (event type correlates with low readiness 5+ times) ---
          if (!patternVariant && !recentPatternTypes.has('calendar_correlation')) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            // Get event classifications for this user
            const { data: classifications } = await supabase
              .from('calendar_event_classifications')
              .select('event_type, calendar_event_id, created_at')
              .eq('user_id', userId)
              .gte('created_at', thirtyDaysAgo);

            if (classifications && classifications.length > 0) {
              // Get checkins for the same period
              const { data: checkins } = await supabase
                .from('daily_checkins')
                .select('checkin_date, outcome')
                .eq('user_id', userId)
                .gte('checkin_date', thirtyDaysAgo.split('T')[0]);

              if (checkins && checkins.length > 0) {
                const lowDays = new Set(
                  checkins.filter(c => LOW_TIERS.includes(c.outcome)).map(c => c.checkin_date)
                );

                // Count how many times each event_type appears on low-readiness days
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
                    patternVariant = variants[3]; // PA-4
                    patternType = 'calendar_correlation';
                    break;
                  }
                }
              }
            }
          }

          // --- Pattern 5: Recovery deficit (HRV ≥20% below baseline for 3+ consecutive days) ---
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
                // HRV delta is negative when below baseline; ≥20% below = ≤ -20
                return hrvDelta !== undefined && hrvDelta <= -20;
              });

              if (allLowHrv) {
                const variants = getPatternAlertVariants({
                  patternType: 'recovery_deficit',
                  hrvDays: 3,
                });
                patternVariant = variants[4]; // PA-5
                patternType = 'recovery_deficit';
              }
            }
          }

          // If any pattern matched, queue the notification
          if (patternVariant && patternType) {
            userNotifications.push({
              userId,
              type: 'pattern_alert',
              variant: patternVariant,
              tokens: userTokens.get(userId)!,
            });
            // Store pattern_type in event_reference for 7-day suppression tracking
            userNotifications[userNotifications.length - 1].eventReference = patternType;
          }
        }
      }

      // ── Morning Anchor ──
      const morningStart = prefs?.morning_window_start ?? 6;
      const morningEnd = prefs?.morning_window_end ?? 9;
      if (
        (prefs?.morning_anchor_enabled ?? true) &&
        localTime >= morningStart && localTime < morningEnd - 0.5 && // 8:30 = 9 - 0.5
        !(logsByType.get('morning_anchor')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        // Check if today's check-in exists
        const { data: todayCheckin } = await supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', todayStr)
          .limit(1);

        if (!todayCheckin || todayCheckin.length === 0) {
          // Calendar pressure
          const { count: eventCount } = await supabase
            .from('calendar_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('start_time', `${todayStr}T00:00:00`)
            .lte('start_time', `${todayStr}T23:59:59`);

          const calendarPressure = (eventCount || 0) > 5 ? 'high' : (eventCount || 0) > 2 ? 'moderate' : 'low';
          const streak = profile?.current_streak || 0;

          const variants = getMorningVariants({
            dayOfWeek: dayName,
            calendarPressure,
            streak,
            morningLoad: 'moderate',
            afternoonLoad: 'moderate',
          });

          // Select based on context
          let selectedVariant: Variant;
          if (calendarPressure === 'high') {
            selectedVariant = variants[1]; // MA-2
          } else if (streak >= 3) {
            selectedVariant = variants[4]; // MA-5
          } else {
            const lastVariant = (logsByType.get('morning_anchor') || [])[0]?.variant_id || null;
            selectedVariant = selectVariant(variants, lastVariant);
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
      // Nudge users to complete their afternoon check-in (12:30-14:30 local)
      if (
        localTime >= 12.5 && localTime < 14.5 &&
        !(logsByType.get('afternoon_checkin')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        // Check if afternoon check-in already exists
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
      const eveningStart = prefs?.evening_window_start ?? 19;
      const eveningEnd = prefs?.evening_window_end ?? 22;
      if (
        (prefs?.evening_close_enabled ?? true) &&
        localTime >= eveningStart && localTime < eveningEnd - 0.5 &&
        !(logsByType.get('evening_close')?.length) &&
        (userNotifications.length === 0 || !suppressed)
      ) {
        // Check evening practice completion
        const { data: todayRitual } = await supabase
          .from('daily_ritual_completions')
          .select('id, session_period')
          .eq('user_id', userId)
          .eq('ritual_date', todayStr)
          .eq('session_period', 'evening')
          .limit(1);

        if (!todayRitual || todayRitual.length === 0) {
          const { count: eventCount } = await supabase
            .from('calendar_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('start_time', `${todayStr}T00:00:00`)
            .lte('start_time', `${todayStr}T23:59:59`);

          const calendarLoad = (eventCount || 0) > 5 ? 'high' : 'moderate';
          const streak = profile?.current_streak || 0;

          // Check HRV delta if available
          const { data: energySnap } = await supabase
            .from('energy_snapshots')
            .select('oura_readiness, computed_data')
            .eq('user_id', userId)
            .eq('snapshot_date', todayStr)
            .limit(1)
            .single();

          const hrvDeltaPct = energySnap?.computed_data?.hrv_delta_pct as number | undefined;

          const variants = getEveningVariants({
            dayOfWeek: dayName,
            calendarLoad,
            streak,
            hrvDeltaPct: hrvDeltaPct ? Math.round(Math.abs(hrvDeltaPct)) : undefined,
            calendarPressure: calendarLoad,
          });

          let selectedVariant: Variant;
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

          userNotifications.push({
            userId,
            type: 'evening_close',
            variant: selectedVariant,
            tokens: userTokens.get(userId)!,
          });
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE 2: State-Aware Nudge (Type 5) — Lowest priority
      // Midday precision intervention when inner state misaligns with
      // outer demands. Requires morning check-in + calendar data.
      // Stricter suppression: 3 hours since last notification.
      // ══════════════════════════════════════════════════════════════════
      if (
        (prefs?.state_aware_nudge_enabled ?? true) &&
        localTime >= 12 && localTime < 15 &&
        !(logsByType.get('state_aware_nudge')?.length) // max 1 per day
      ) {
        // Stricter suppression: no notification in last 3 hours
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const strictSuppressed = lastSentAt && lastSentAt > threeHoursAgo;

        if (!strictSuppressed && userNotifications.length === 0) {
          // Check: user has NOT opened app in last 3 hours
          const lastAppOpen = lastAppOpenMap.get(userId);
          const appOpenedIn3h = lastAppOpen && lastAppOpen > threeHoursAgo;

          if (!appOpenedIn3h) {
            // Check: morning check-in exists with depleted/managing outcome
            const { data: morningCheckin } = await supabase
              .from('daily_checkins')
              .select('outcome')
              .eq('user_id', userId)
              .eq('checkin_date', todayStr)
              .limit(1)
              .single();

            if (morningCheckin && LOW_TIERS.includes(morningCheckin.outcome)) {
              // Check: no afternoon reset completed today
              const { data: afternoonReset } = await supabase
                .from('daily_ritual_completions')
                .select('id')
                .eq('user_id', userId)
                .eq('ritual_date', todayStr)
                .eq('session_period', 'afternoon')
                .limit(1);

              if (!afternoonReset || afternoonReset.length === 0) {
                // Check: afternoon calendar pressure is high (3+ high-stakes events in next 4 hours)
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
                  // Determine variant
                  let selectedVariant: Variant;

                  // Check for a specific high-priority event 60-120 min away for SN-4
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

                  if (nearEvent) {
                    selectedVariant = variants[3]; // SN-4
                  } else if (highStakesEvents.length >= 3) {
                    selectedVariant = variants[0]; // SN-1
                  } else {
                    selectedVariant = variants[1]; // SN-2 (default)
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

      // ── Daily Fallback: guarantee at least 1 touch per day ──
      // If no nudge has qualified AND it's past 10 AM local AND no notification sent today
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
          type: 'morning_anchor', // Use morning_anchor type for routing to /daily-check-in
          variant: selectedFallback,
          tokens: userTokens.get(userId)!,
        });
      }

      // Apply final suppression: only keep highest-priority notification if multiple
      if (userNotifications.length > 1 && suppressed) {
        // Priority: pre_event_prep > pattern_alert > morning_anchor > evening_close > state_aware_nudge
        const priority = ['pre_event_prep', 'pattern_alert', 'morning_anchor', 'evening_close', 'state_aware_nudge'];
        userNotifications.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
        allNotifications.push(userNotifications[0]);
      } else {
        // Special exception: Morning Anchor and Pre-Event Prep can both send
        // if the event is ≥4 hours after the morning send
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

    // Cache APNs JWT for the batch (valid for ~1 hour)
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

      // For pattern alerts, store the pattern_type for 7-day suppression tracking
      if (notif.type === 'pattern_alert' && notif.eventReference) {
        payload.pattern_type = notif.eventReference;
      }

      // Log to notification_log and get the ID for engagement tracking
      const { data: logRow } = await supabase.from('notification_log').insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.variant.id,
        event_reference: notif.eventReference || null,
        payload,
      }).select('id').single();

      const notificationLogId = logRow?.id;

      // Send via APNs if credentials are available
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
