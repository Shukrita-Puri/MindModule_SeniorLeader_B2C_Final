import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { collectUnresolvedAttendeeEmails, detachResolverBatch } from "../_shared/attendeeResolverQueue.ts";
import { computeIdentityKey } from "../_shared/rules/calendar-merge.ts";
import { classifyGoogleCalendarError } from "../_shared/rules/google-calendar-errors.ts";
import { classifyMicrosoftCalendarError } from "../_shared/rules/microsoft-calendar-errors.ts";
import {
  buildSuccessfulSyncUpdate,
  buildRateLimitedUpdate,
  buildAuthFailureUpdate,
  buildGenericErrorUpdate,
  resolveRetryDelaySeconds,
  computeRetryJitterSeconds,
} from "../_shared/rules/calendar-connection-state.ts";
import {
  buildQuotaCooldownUpsert,
  computeQuotaScopeKey,
} from "../_shared/rules/calendar-quota-scope.ts";
import {
  ensureFreshAccessToken,
  type OAuthClientConfig,
} from "../_shared/calendar-token-refresh.ts";
import { mapEnsureFreshOutcomeToSyncPhase } from "../_shared/rules/sync-calendar-token-outcome.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: safe 200 JSON response
function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Auth0 token verification
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Missing Authorization header');
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN') || Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('Auth0 domain not configured');

  const res = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Token verification failed');
  const info = await res.json();
  if (!info.sub) throw new Error('Token missing sub claim');
  return info.sub;
}

type AttendeeSignal = {
  displayName: string | null;
  email: string | null;
  emailDomain: string | null;
  responseStatus: string | null;
  isSelf: boolean;
  isOrganizer: boolean;
};

function normalizeEmailDomain(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip mailto: prefix if present (Apple-style URLs)
  const stripped = trimmed.startsWith('mailto:') ? trimmed.slice(7) : trimmed;
  return /^[^\s@]+@[^\s@]+$/.test(stripped) ? stripped : null;
}

function statusToLabel(status: unknown): string | null {
  if (typeof status === 'string' && status.trim()) return status.toLowerCase();
  return null;
}

function buildAttendeeSignals(
  organizer: { name?: unknown; email?: unknown; self?: unknown } | undefined,
  attendees: unknown[] | undefined,
): {
  organizer: { displayName: string | null; email: string | null; emailDomain: string | null; isCurrentUser: boolean };
  attendees: AttendeeSignal[];
  attendeeCount: number;
  responseSummary: Record<string, number>;
} {
  const attendeeSignals = (attendees || [])
    .map((attendee: any) => {
      const emailRaw = attendee?.email || attendee?.emailAddress?.address || attendee?.url || attendee?.contactUrl;
      const email = normalizeEmail(emailRaw);
      return {
        displayName:
          typeof attendee?.displayName === 'string' ? attendee.displayName :
          typeof attendee?.emailAddress?.name === 'string' ? attendee.emailAddress.name :
          typeof attendee?.name === 'string' ? attendee.name :
          (email || (typeof attendee?.email === 'string' ? attendee.email : null)),
        email,
        emailDomain: email ? email.split('@')[1] || null : normalizeEmailDomain(emailRaw),
        responseStatus: statusToLabel(attendee?.responseStatus || attendee?.status?.response),
        isSelf: attendee?.self === true || attendee?.isSelf === true,
        isOrganizer: attendee?.organizer === true || attendee?.type === 'organizer' || attendee?.isOrganizer === true,
      };
    })
    .filter((attendee): attendee is AttendeeSignal => !!attendee);

  const responseSummary: Record<string, number> = {};
  for (const attendee of attendeeSignals) {
    const key = attendee.responseStatus || 'unknown';
    responseSummary[key] = (responseSummary[key] || 0) + 1;
  }

  const orgEmail = normalizeEmail((organizer as any)?.email || (organizer as any)?.emailAddress?.address);
  return {
    organizer: {
      displayName:
        typeof organizer?.name === 'string' ? organizer.name :
        typeof (organizer as any)?.emailAddress?.name === 'string' ? (organizer as any).emailAddress.name : null,
      email: orgEmail,
      emailDomain: orgEmail ? orgEmail.split('@')[1] || null : normalizeEmailDomain((organizer as any)?.email || (organizer as any)?.emailAddress?.address),
      isCurrentUser: organizer?.self === true,
    },
    attendees: attendeeSignals,
    attendeeCount: attendeeSignals.length,
    responseSummary,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { provider } = z.object({ provider: z.enum(['google', 'microsoft']) }).parse(body);

    // Auth: support both Auth0 token (frontend) and internal scheduled call with userId+internalSecret
    let userId: string;
    const authHeader = req.headers.get('Authorization');
    const internalSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (body._internalUserId && body._internalKey === internalSecret) {
      // Trusted internal call from sync-calendar-scheduled
      userId = body._internalUserId as string;
      console.log('[sync-calendar] Internal call for user:', userId);
    } else {
      try {
        userId = await verifyAuth0Token(authHeader);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[sync-calendar] Starting sync for user:', userId, 'provider:', provider);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load connection – only active
    const { data: connection, error: connErr } = await serviceClient
      .from('calendar_connections')
      .select('id, user_id, provider, is_active, last_sync, token_expires_at, access_token_enc, refresh_token_enc, token_iv, refresh_token_iv, token_enc_v, consecutive_delay_count')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (connErr || !connection) {
      console.log('[sync-calendar] connection_inactive_or_missing for user:', userId);
      return jsonOk({ success: false, skipped: true, reason: 'connection_inactive_or_missing', error: 'Calendar is disconnected.' });
    }

    // Get encryption key
    const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
    if (!encKeyB64) {
      console.error('[sync-calendar] TOKEN_ENC_KEY_B64 not configured');
      return jsonOk({ success: false, reconnectRequired: false, reason: 'config_error', error: 'Server configuration error.' });
    }

    // Delegate access/refresh token lifecycle to the shared helper so
    // `sync-calendar` and `register-calendar-watch` cannot drift on
    // refresh, rotation, or reconnect semantics.
    const oauthConfig: OAuthClientConfig = {
      googleClientId: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
      googleClientSecret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '',
      microsoftClientId: Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '',
      microsoftClientSecret: Deno.env.get('MICROSOFT_CALENDAR_CLIENT_SECRET') ?? '',
    };
    const now = new Date();

    // Shared quota-scope coordination. Every transient outcome below
    // additionally upserts a `calendar_quota_cooldowns` row keyed by
    // provider + oauth client id, so many rows sharing the same
    // upstream quota bucket can be suppressed collectively by the
    // scheduler. See `_shared/rules/calendar-quota-scope.ts` for the
    // success-policy rationale (per-connection success does NOT clear
    // the shared scope).
    const scopeKey = computeQuotaScopeKey({
      provider,
      clientId: provider === 'google'
        ? oauthConfig.googleClientId
        : oauthConfig.microsoftClientId,
    });
    async function upsertScopeCooldown(finalRetryAfterSeconds: number, reason: string | null): Promise<void> {
      const { data: existing } = await serviceClient
        .from('calendar_quota_cooldowns')
        .select('hit_count')
        .eq('scope_key', scopeKey)
        .maybeSingle();
      const upsertRow = buildQuotaCooldownUpsert({
        scopeKey,
        provider,
        finalRetryAfterSeconds,
        reason,
        priorHitCount: (existing as { hit_count?: number | null } | null)?.hit_count ?? 0,
        now,
      });
      const { error: upsertErr } = await serviceClient
        .from('calendar_quota_cooldowns')
        .upsert(upsertRow, { onConflict: 'scope_key' });
      if (upsertErr) {
        // Never let a shared-cooldown write failure mask the per-row
        // response. Log and continue — the per-row `next_retry_at`
        // still protects this connection.
        console.warn('[sync-calendar] quota_scope_upsert_failed', JSON.stringify({
          scopeKey, provider, error: upsertErr.message,
        }));
        return;
      }
      console.log('[sync-calendar] quota_scope_cooldown_upserted', JSON.stringify({
        scopeKey,
        provider,
        cooldownUntil: upsertRow.cooldown_until,
        finalRetryAfterSeconds: upsertRow.retry_after_seconds,
        hitCount: upsertRow.hit_count,
        reason: upsertRow.last_reason,
      }));
    }

    const tokenOutcome = await ensureFreshAccessToken(
      serviceClient,
      {
        id: connection.id,
        provider: connection.provider,
        token_expires_at: connection.token_expires_at,
        access_token_enc: connection.access_token_enc,
        refresh_token_enc: connection.refresh_token_enc,
        token_iv: connection.token_iv,
        refresh_token_iv: connection.refresh_token_iv,
      },
      encKeyB64,
      oauthConfig,
      { now },
    );
    console.log('[sync-calendar] token_phase outcome:', tokenOutcome.outcome);

    const phase = mapEnsureFreshOutcomeToSyncPhase(tokenOutcome);
    if (phase.kind === 'reconnect') {
      // Helper has already flipped is_active=false when appropriate.
      return jsonOk(phase.response);
    }
    if (phase.kind === 'transient') {
      // Transient refresh failure — helper preserved is_active. Mark
      // the connection as sync_delayed so the UI can render a soft
      // "will retry" state, mirroring the Google rate-limit branch.
      const priorCount = (connection as { consecutive_delay_count?: number | null }).consecutive_delay_count ?? 0;
      const rateUpdate = buildRateLimitedUpdate({
        message: phase.dbMessage,
        reason: phase.dbReason,
        retryAfterSeconds: null, // token refresh has no Retry-After
        consecutivePriorCount: priorCount,
        jitterSeed: connection.id,
        now,
      });
      const baseDelay_tr = resolveRetryDelaySeconds(null, { consecutivePriorCount: priorCount });
      const jitter_tr = computeRetryJitterSeconds(`${connection.id}:${priorCount + 1}`, baseDelay_tr);
      await serviceClient
        .from('calendar_connections')
        .update(rateUpdate)
        .eq('id', connection.id);
      await upsertScopeCooldown(rateUpdate.retry_after_seconds, phase.dbReason);
      console.log('[sync-calendar] token_refresh:sync_delayed', JSON.stringify({
        connectionId: connection.id,
        priorCount,
        appliedCount: rateUpdate.consecutive_delay_count,
        baseDelaySeconds: baseDelay_tr,
        jitterSeconds: jitter_tr,
        finalRetryAfterSeconds: rateUpdate.retry_after_seconds,
        nextRetryAt: rateUpdate.next_retry_at,
      }));
      return jsonOk(phase.response);
    }
    const accessToken = phase.accessToken;

    // Fetch calendar events
    interface CalendarEventRow {
      external_id: string;
      title: string;
      start_time: string;
      end_time: string;
      is_organizer: boolean;
      attendees_count: number;
      is_recurring: boolean;
      event_metadata: Record<string, unknown>;
      user_id?: string;
    }

    let events: CalendarEventRow[] = [];
    // Sync window:
    //  - First sync after connect: [today-30d, today+8d] for one-time historical backfill
    //  - Subsequent syncs: [today-2d, today+8d] (covers timezone edge cases + recently-edited past events)
    // History beyond the rolling window is preserved (we no longer delete past events on sync).
    const startOfTodayUTC = new Date(now);
    startOfTodayUTC.setUTCHours(0, 0, 0, 0);
    const timezoneOffset = body.timezoneOffset ?? 0;
    const localMidnight = new Date(startOfTodayUTC.getTime() + timezoneOffset * 60000);

    const isFirstSync = !connection.last_sync;
    const lookbackDays = isFirstSync ? 30 : 2;
    const syncWindowStart = new Date(localMidnight.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const syncWindowEnd = new Date(localMidnight.getTime() + 8 * 24 * 60 * 60 * 1000);

    console.log('[sync-calendar] Sync window:', syncWindowStart.toISOString(), '→', syncWindowEnd.toISOString(), 'firstSync:', isFirstSync);

    if (provider === 'google') {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${syncWindowStart.toISOString()}&timeMax=${syncWindowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const errText = await response.text();
        const classification = classifyGoogleCalendarError(response.status, errText, response.headers);
        console.error(
          '[sync-calendar] Google API error:',
          JSON.stringify({
            status: response.status,
            kind: classification.kind,
            reason: classification.reason,
            retryAfterSeconds: classification.retryAfterSeconds,
            body: errText.slice(0, 500),
          }),
        );

        if (classification.kind === 'rate_limited') {
          // Temporary throttling — DO NOT flip is_active or ask the user to
          // reconnect. Mark the connection as sync_delayed so the UI can
          // show a soft "will retry" state and move on.
          const priorCount = (connection as { consecutive_delay_count?: number | null }).consecutive_delay_count ?? 0;
          const rateUpdate = buildRateLimitedUpdate({
            message: classification.message ?? `Google rate limit: ${classification.reason ?? 'unknown'}`,
            reason: classification.reason,
            retryAfterSeconds: classification.retryAfterSeconds ?? null,
            consecutivePriorCount: priorCount,
            jitterSeed: connection.id,
          });
          const baseDelay_g = resolveRetryDelaySeconds(
            classification.retryAfterSeconds ?? null,
            { consecutivePriorCount: priorCount },
          );
          const jitter_g = computeRetryJitterSeconds(`${connection.id}:${priorCount + 1}`, baseDelay_g);
          await serviceClient
            .from('calendar_connections')
            .update(rateUpdate)
            .eq('id', connection.id);
          await upsertScopeCooldown(rateUpdate.retry_after_seconds, classification.reason);
          console.log('[sync-calendar] rate_limited:sync_delayed', JSON.stringify({
            connectionId: connection.id,
            reason: classification.reason,
            providerHintSeconds: classification.retryAfterSeconds,
            priorCount,
            appliedCount: rateUpdate.consecutive_delay_count,
            baseDelaySeconds: baseDelay_g,
            jitterSeconds: jitter_g,
            finalRetryAfterSeconds: rateUpdate.retry_after_seconds,
            nextRetryAt: rateUpdate.next_retry_at,
          }));
          return jsonOk({
            success: false,
            rateLimited: true,
            syncStatus: 'sync_delayed',
            reason: classification.reason ?? 'rate_limited',
            retryAfterSeconds: rateUpdate.retry_after_seconds,
            nextRetryAt: rateUpdate.next_retry_at,
            consecutiveDelayCount: rateUpdate.consecutive_delay_count,
            error: 'Google Calendar is rate-limiting sync right now — will retry shortly.',
          });
        }

        if (classification.kind === 'auth_failed') {
          // 401 or true 403 auth/permission failure — token actually invalid
          // despite refresh, or scope was revoked. Existing reconnect path.
          await serviceClient
            .from('calendar_connections')
            .update(buildAuthFailureUpdate({
              message: classification.message ?? `Google auth error: ${classification.reason ?? 'unauthorized'}`,
              reason: classification.reason,
            }))
            .eq('id', connection.id);
          return jsonOk({
            success: false,
            reconnectRequired: true,
            reason: `google_api_${classification.reason ?? 'unauthorized'}`,
            error: 'Calendar session expired. Please reconnect your calendar.',
          });
        }

        // Generic non-rate-limit failure — surface but do not disconnect.
        await serviceClient
          .from('calendar_connections')
          .update(buildGenericErrorUpdate({
            message: classification.message ?? `Google API error ${response.status}`,
            reason: classification.reason,
          }))
          .eq('id', connection.id);
        return jsonOk({ success: false, error: 'Failed to fetch calendar events from Google' });
      }

      const data = await response.json();
      if (data.items) {
        events = data.items.map((event: Record<string, unknown>) => {
          const start = event.start as Record<string, string>;
          const end = event.end as Record<string, string>;
          const organizer = event.organizer as Record<string, unknown> | undefined;
          const attendees = event.attendees as unknown[] | undefined;
          const attendeeSignals = buildAttendeeSignals(organizer, attendees);
          // Conference / meeting URL: prefer explicit conferenceData entry over hangoutLink
          const conf = event.conferenceData as any;
          const conferenceUrl =
            (Array.isArray(conf?.entryPoints) ? conf.entryPoints.find((ep: any) => ep?.entryPointType === 'video')?.uri : null) ||
            (typeof event.hangoutLink === 'string' ? event.hangoutLink : null) || null;
          return {
            external_id: event.id as string,
            title: (event.summary as string) || 'Untitled Event',
            start_time: start?.dateTime || start?.date || '',
            end_time: end?.dateTime || end?.date || '',
            is_organizer: !!(organizer?.self),
            attendees_count: attendees?.length || 0,
            is_recurring: !!event.recurringEventId,
            event_metadata: {
              location: event.location,
              description: event.description,
              hangoutLink: event.hangoutLink,
              meetingUrl: conferenceUrl,
              conferenceProvider: conf?.conferenceSolution?.name ?? null,
              recurrence: event.recurrence ?? null,
              recurringEventId: event.recurringEventId ?? null,
              htmlLink: event.htmlLink ?? null,
              eventStatus: event.status ?? null,
              visibility: event.visibility ?? null,
              attendeeSignals,
            },
          };
        });
      }
    } else if (provider === 'microsoft') {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${syncWindowStart.toISOString()}&endDateTime=${syncWindowEnd.toISOString()}&$orderby=start/dateTime&$top=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const errText = await response.text();
        const classification = classifyMicrosoftCalendarError(
          response.status,
          errText,
          response.headers,
        );
        console.error(
          '[sync-calendar] Microsoft Graph API error:',
          JSON.stringify({
            status: response.status,
            kind: classification.kind,
            reason: classification.reason,
            retryAfterSeconds: classification.retryAfterSeconds,
            body: errText.slice(0, 500),
          }),
        );

        if (classification.kind === 'rate_limited') {
          // Temporary throttling / upstream 5xx — keep is_active, mark as
          // sync_delayed so the UI can render a soft "will retry" state.
          const priorCount = (connection as { consecutive_delay_count?: number | null }).consecutive_delay_count ?? 0;
          const rateUpdate = buildRateLimitedUpdate({
            message: classification.message ?? `Microsoft Graph transient error: ${classification.reason ?? 'unknown'}`,
            reason: classification.reason,
            retryAfterSeconds: classification.retryAfterSeconds ?? null,
            consecutivePriorCount: priorCount,
            jitterSeed: connection.id,
          });
          const baseDelay_m = resolveRetryDelaySeconds(
            classification.retryAfterSeconds ?? null,
            { consecutivePriorCount: priorCount },
          );
          const jitter_m = computeRetryJitterSeconds(`${connection.id}:${priorCount + 1}`, baseDelay_m);
          await serviceClient
            .from('calendar_connections')
            .update(rateUpdate)
            .eq('id', connection.id);
          await upsertScopeCooldown(rateUpdate.retry_after_seconds, classification.reason);
          console.log('[sync-calendar] microsoft:rate_limited:sync_delayed', JSON.stringify({
            connectionId: connection.id,
            reason: classification.reason,
            providerHintSeconds: classification.retryAfterSeconds,
            priorCount,
            appliedCount: rateUpdate.consecutive_delay_count,
            baseDelaySeconds: baseDelay_m,
            jitterSeconds: jitter_m,
            finalRetryAfterSeconds: rateUpdate.retry_after_seconds,
            nextRetryAt: rateUpdate.next_retry_at,
          }));
          return jsonOk({
            success: false,
            rateLimited: true,
            syncStatus: 'sync_delayed',
            reason: classification.reason ?? 'rate_limited',
            retryAfterSeconds: rateUpdate.retry_after_seconds,
            nextRetryAt: rateUpdate.next_retry_at,
            consecutiveDelayCount: rateUpdate.consecutive_delay_count,
            error: 'Microsoft Calendar is throttling sync right now — will retry shortly.',
          });
        }

        if (classification.kind === 'auth_failed') {
          await serviceClient
            .from('calendar_connections')
            .update(buildAuthFailureUpdate({
              message: classification.message ?? `Microsoft auth error: ${classification.reason ?? 'unauthorized'}`,
              reason: classification.reason,
            }))
            .eq('id', connection.id);
          return jsonOk({
            success: false,
            reconnectRequired: true,
            reason: `microsoft_api_${classification.reason ?? 'unauthorized'}`,
            error: 'Calendar session expired. Please reconnect your calendar.',
          });
        }

        // Generic non-auth failure — surface but do not disconnect.
        await serviceClient
          .from('calendar_connections')
          .update(buildGenericErrorUpdate({
            message: classification.message ?? `Microsoft Graph error ${response.status}`,
            reason: classification.reason,
          }))
          .eq('id', connection.id);
        return jsonOk({ success: false, error: 'Failed to fetch calendar events from Microsoft Calendar' });
      }

      const data = await response.json();
      if (data.value) {
        events = data.value.map((event: Record<string, unknown>) => {
          const start = event.start as Record<string, string>;
          const end = event.end as Record<string, string>;
          const loc = event.location as Record<string, string> | undefined;
          const attendees = event.attendees as unknown[] | undefined;
          const attendeeSignals = buildAttendeeSignals(
            event.organizer as Record<string, unknown> | undefined,
            attendees,
          );
          const onlineMeeting = event.onlineMeeting as any;
          const meetingUrl =
            (typeof onlineMeeting?.joinUrl === 'string' ? onlineMeeting.joinUrl : null) ||
            (typeof event.onlineMeetingUrl === 'string' ? (event.onlineMeetingUrl as string) : null) ||
            null;
          const body = event.body as any;
          const description =
            (typeof event.bodyPreview === 'string' && event.bodyPreview) ||
            (typeof body?.content === 'string' ? body.content : null) || null;
          return {
            external_id: event.id as string,
            title: (event.subject as string) || 'Untitled Event',
            start_time: start?.dateTime || '',
            end_time: end?.dateTime || '',
            is_organizer: !!(event.isOrganizer),
            attendees_count: attendees?.length || 0,
            is_recurring: !!event.recurrence,
            event_metadata: {
              location: loc?.displayName,
              body: event.bodyPreview,
              description,
              webLink: event.webLink,
              meetingUrl,
              isOnlineMeeting: event.isOnlineMeeting ?? null,
              onlineMeetingProvider: event.onlineMeetingProvider ?? null,
              recurrence: event.recurrence ?? null,
              eventStatus: event.showAs ?? null,
              sensitivity: event.sensitivity ?? null,
              importance: event.importance ?? null,
              attendeeSignals,
            },
          };
        });
      }
    }

    // Logistic noise keywords – events that should never drive insights or JIT plans
    const LOGISTIC_KEYWORDS = [
      'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
      'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
      'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
      'car service', 'mot', 'oil change', 'dentist', 'optician',
      'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
      'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
    ];
    const LOGISTIC_PATTERN = /\[\d{6,}\]/;

    // Classify events
    const classifiedEvents = events.map(event => {
      const title = event.title.toLowerCase();
      let eventType = 'meeting';
      let isHighStakes = false;

      // Check logistic first – before any other classification
      const isLogistic = LOGISTIC_KEYWORDS.some(kw => title.includes(kw)) || LOGISTIC_PATTERN.test(event.title);
      if (isLogistic) { eventType = 'logistic'; isHighStakes = false; }
      else if (title.includes('board') || title.includes('executive')) { eventType = 'board-meeting'; isHighStakes = true; }
      else if (title.includes('presentation') || title.includes('demo') || title.includes('pitch')) { eventType = 'presentation'; isHighStakes = true; }
      else if (title.includes('client') || title.includes('customer')) { eventType = 'client-call'; isHighStakes = event.attendees_count > 5; }
      else if (title.includes('interview')) { eventType = 'interview'; isHighStakes = true; }
      else if (title.includes('1:1') || title.includes('one-on-one')) { eventType = 'one-on-one'; }
      else if (title.includes('focus') || title.includes('deep work')) { eventType = 'deep-work'; }
      else if (title.includes('exam') || title.includes('test')) { eventType = 'exam'; isHighStakes = true; }
      else if (title.includes('deadline') || title.includes('submission')) { eventType = 'deadline'; isHighStakes = true; }

      return {
        ...event,
        user_id: userId,
        provider,
        event_metadata: { ...event.event_metadata, eventType, isHighStakes },
        // Phase 2 write-time dedupe foundation: shared TS key computed once
        // per row so mirrored Apple/Google/MS copies land with the same
        // identity_key. Null-safe when title/times are missing.
        identity_key: computeIdentityKey({
          title: event.title,
          start_time: event.start_time,
          end_time: event.end_time,
        }),
      };
    });

    console.log('[sync-calendar] Classified', classifiedEvents.length, 'events');

    // Layer 1: Upsert events (preserve history) instead of DELETE → INSERT.
    // Only future-dated events that disappeared from the upstream API get deleted.
    if (classifiedEvents.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('calendar_events')
        .upsert(classifiedEvents, { onConflict: 'user_id,provider,external_id' });
      if (upsertError) {
        console.error('[sync-calendar] Upsert error:', upsertError);
        throw upsertError;
      }
    }

    // Scoped delete: mirror upstream deletions across the ENTIRE active sync window
    // (past lookback + future). This means:
    //   • Future events deleted in Google → removed here on next sync
    //   • Past events deleted in Google within the lookback window → also removed (privacy + accuracy)
    //   • Past events OUTSIDE the lookback window (older than 2d on routine sync, 30d on first sync) →
    //     PRESERVED until the 90-day retention cron prunes them. Deep history is safe.
    const upstreamIds = classifiedEvents.map(e => e.external_id);
    const windowStartIso = syncWindowStart.toISOString();
    const windowEndIso = syncWindowEnd.toISOString();

    if (upstreamIds.length > 0) {
      const { error: scopedDelErr } = await serviceClient
        .from('calendar_events')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider)
        .gte('start_time', windowStartIso)
        .lte('start_time', windowEndIso)
        .not('external_id', 'in', `(${upstreamIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',')})`);
      if (scopedDelErr) {
        console.warn('[sync-calendar] Scoped delete warning (non-fatal):', scopedDelErr.message);
      }
    } else {
      // No upstream events at all in window – clear it (calendar emptied or all events deleted)
      await serviceClient
        .from('calendar_events')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider)
        .gte('start_time', windowStartIso)
        .lte('start_time', windowEndIso);
    }

    // Update last_sync AND clear every lingering transient error/delay
    // marker (including `last_sync_delayed_at`) so a previous rate-limit
    // blip does not stick around as a stale warning after a clean sync.
    // See supabase/functions/_shared/rules/calendar-connection-state.ts.
    await serviceClient
      .from('calendar_connections')
      .update(buildSuccessfulSyncUpdate())
      .eq('user_id', userId)
      .eq('provider', provider);

    console.log('[sync-calendar] Sync complete! Events upserted:', classifiedEvents.length, 'firstSync:', isFirstSync);

    // Post-sync attendee resolver (fire-and-forget). Queues
    // `resolve-attendee-relationship` for new external attendees so the
    // first Plan generation after a sync no longer has to lazy-resolve
    // them. Self/generic/already-fresh-cached emails are filtered out.
    // Resolver self-enforces a 50/user/day cap; this batch is capped at 25.
    try {
      const { emails, skipped_generic, skipped_cached } =
        await collectUnresolvedAttendeeEmails(serviceClient, userId, classifiedEvents);
      console.log(`[sync-calendar] resolver_candidates count=${emails.length} skipped_generic=${skipped_generic} skipped_cached=${skipped_cached}`);
      detachResolverBatch(userId, emails, 'sync-calendar');
    } catch (e) {
      console.warn('[sync-calendar] resolver hook error category=hook msg=', (e as Error)?.message);
    }

    return jsonOk({ success: true, eventCount: classifiedEvents.length, lastSync: new Date().toISOString(), firstSync: isFirstSync });
  } catch (error) {
    console.error('[sync-calendar] Unhandled error:', error);
    // Return 200 with failure to prevent caller crashes
    return jsonOk({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
