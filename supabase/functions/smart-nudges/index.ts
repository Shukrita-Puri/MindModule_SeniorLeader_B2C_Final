import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const [
      { data: profiles },
      { data: preferences },
    ] = await Promise.all([
      supabase.from('profiles').select('id, current_streak, timezone_offset').in('id', userIds),
      supabase.from('notification_preferences').select('*').in('user_id', userIds),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const prefMap = new Map((preferences || []).map(p => [p.user_id, p]));

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
            if (score < 50) continue;

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

      // Apply final suppression: only keep highest-priority notification if multiple
      if (userNotifications.length > 1 && suppressed) {
        // Priority: pre_event_prep > morning_anchor > evening_close
        const priority = ['pre_event_prep', 'morning_anchor', 'evening_close'];
        userNotifications.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
        allNotifications.push(userNotifications[0]);
      } else {
        allNotifications.push(...userNotifications);
      }
    }

    console.log(`[smart-nudges] ${allNotifications.length} notifications qualified`);

    // 4. Send notifications (dry run mode — log without sending via FCM)
    const fcmKey = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    const isDryRun = !fcmKey;

    for (const notif of allNotifications) {
      const payload = {
        title: notif.variant.title,
        body: notif.variant.body,
        notification_type: notif.type,
        variant_id: notif.variant.id,
        dry_run: isDryRun,
      };

      // Log to notification_log
      await supabase.from('notification_log').insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.variant.id,
        event_reference: notif.eventReference || null,
        payload,
      });

      if (!isDryRun) {
        // TODO: FCM HTTP v1 send — activated when Capacitor wrapper is ready
        console.log(`[smart-nudges] Would send FCM to ${notif.tokens.length} tokens for ${notif.userId}`);
      }

      console.log(`[smart-nudges] ${isDryRun ? 'DRY RUN' : 'SENT'}: ${notif.type}/${notif.variant.id} → ${notif.userId}`);
    }

    return new Response(JSON.stringify({
      processed: userIds.length,
      notifications: allNotifications.length,
      dry_run: isDryRun,
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
