import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.118.0/cors';
import { z } from 'npm:zod@3';
import { authenticateRequest } from '../_shared/auth.ts';
import { classifyTripEvidence, parseTrips } from '../_shared/travel/trip-windows.ts';
import { decideRelocation, localDay, respondToPrompt, type LocationSample, type PromptState } from './decision.ts';

const ActionSchema = z.object({ action: z.enum(['not_now', 'keep_home', 'update']) });
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return reply({ error: 'method_not_allowed' }, 405);
  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  let action: 'not_now' | 'keep_home' | 'update' | null = null;
  if (req.method === 'POST') {
    const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: 'invalid_action' }, 400);
    action = parsed.data.action;
  }
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ prompt: null });
    const db = createClient(url, key);
    const { data: profile, error } = await db.from('profiles')
      .select('home_lat, home_lng, home_timezone, home_location_set_at, relocation_prompt_state')
      .eq('id', auth.userId).maybeSingle();
    if (error || !profile || profile.home_lat == null || profile.home_lng == null ||
      !profile.home_timezone || !profile.home_location_set_at) return reply({ prompt: null });
    const now = Date.now();
    const anchor = `${profile.home_location_set_at}|${profile.home_lat}|${profile.home_lng}`;
    const stored = (profile.relocation_prompt_state ?? {}) as PromptState;
    const state = stored.anchor === anchor ? stored : { anchor };
    if (action) {
      const next = respondToPrompt(state, action, now);
      const { error: writeError } = await db.from('profiles').update({
        relocation_prompt_state: next, possible_relocation_detected: false,
      }).eq('id', auth.userId);
      return writeError ? reply({ ok: false }, 503) : reply({ ok: true, prompt: null });
    }
    const timezone = profile.home_timezone;
    const today = localDay(now, timezone);
    const from = new Date(now - 58 * 86_400_000).toISOString();
    // Paginate rather than silently truncating high-frequency native pings.
    const samples: LocationSample[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: pingError } = await db.from('travel_location_pings')
        .select('lat, lng, accuracy_m, captured_at, created_at').eq('user_id', auth.userId)
        .gte('captured_at', from).lte('captured_at', new Date(now).toISOString())
        .order('captured_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
      if (pingError) return reply({ prompt: null });
      samples.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [travel, calendar] = await Promise.all([
      db.from('travel_state').select('state, meta').eq('user_id', auth.userId).maybeSingle(),
      db.from('primary_calendar_events').select('title, start_time, end_time')
        .eq('user_id', auth.userId).lte('start_time', new Date(now + 86_400_000).toISOString())
        .gte('end_time', new Date(now - 86_400_000).toISOString()),
    ]);
    if (travel.error || calendar.error) return reply({ prompt: null });
    const calendarTrip = (calendar.data ?? []).some(event => {
      if (!event.start_time) return false;
      const kind = classifyTripEvidence(event);
      return kind !== null && kind !== 'offsite' && localDay(Date.parse(event.start_time), timezone) <= today &&
        localDay(Date.parse(event.end_time ?? event.start_time) - 1, timezone) >= today;
    });
    const windowTrip = parseTrips(travel.data?.meta).some(trip =>
      trip.source !== 'location' && trip.start <= today && trip.end >= today &&
      trip.evidence.some(kind => kind !== 'offsite'));
    const decision = decideRelocation({
      now, homeLat: profile.home_lat, homeLng: profile.home_lng, homeSetAt: profile.home_location_set_at,
      timezone, samples, state,
      travelling: ['en_route', 'returning', 'travel_planned'].includes(travel.data?.state ?? '') || calendarTrip || windowTrip,
    });
    if (JSON.stringify(decision.state) !== JSON.stringify(stored)) {
      const { error: writeError } = await db.from('profiles').update({
        relocation_prompt_state: decision.state, possible_relocation_detected: false,
      }).eq('id', auth.userId);
      if (writeError) return reply({ prompt: null });
    }
    return reply({ prompt: decision.eligible ? { title: "You've been based somewhere new",
      body: 'Your last 8 weeks have mostly been outside your saved home area. If home has changed, update it so your days and holidays read correctly.' } : null,
      reason: decision.reason });
  } catch {
    // Optional home-screen prompt must never break sign-in or cards.
    return reply({ prompt: null });
  }
});