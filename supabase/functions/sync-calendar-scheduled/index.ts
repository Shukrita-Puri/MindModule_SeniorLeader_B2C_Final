import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isConnectionEligibleForSync } from "../_shared/rules/calendar-connection-state.ts";
import {
  computeQuotaScopeKey,
  isScopeEligibleForSync,
  type QuotaCooldownRow,
} from "../_shared/rules/calendar-quota-scope.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { isAuthorizedCronCaller, cronForbiddenResponse } from "../_shared/cron-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only pg_cron (CRON_SHARED_SECRET) or a service-role caller may fan out
  // per-user calendar syncs. Reject public/anon callers.
  if (!isAuthorizedCronCaller(req)) {
    return cronForbiddenResponse(corsHeaders);
  }

  try {
    console.log('[sync-calendar-scheduled] Starting scheduled sync...');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Only OAuth-backed providers can be refreshed from the server.
    // Apple Calendar is synced on-device by the native iOS bridge.
    const { data: connections, error: connError } = await serviceClient
      .from('calendar_connections')
      .select('user_id, provider, next_retry_at, retry_after_seconds, sync_status')
      .eq('is_active', true)
      .in('provider', ['google', 'microsoft']);

    if (connError) {
      console.error('[sync-calendar-scheduled] Error fetching connections:', connError);
      throw connError;
    }

    // Fetch timezone_offset for all connected users in one query
    const userIds = [...new Set((connections || []).map(c => c.user_id))];
    const tzMap: Record<string, number> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, timezone_offset')
        .in('id', userIds);
      for (const p of profiles || []) {
        tzMap[p.id] = p.timezone_offset ?? 0;
      }
    }

    const total = connections?.length || 0;
    console.log('[sync-calendar-scheduled] Found', total, 'active OAuth calendar connections');

    // Pre-fetch shared quota cooldowns in one query so we can defer a
    // whole scope without hammering `sync-calendar` for each row.
    const scopeCooldowns = new Map<string, QuotaCooldownRow>();
    {
      const { data: cooldownRows, error: cooldownErr } = await serviceClient
        .from('calendar_quota_cooldowns')
        .select('scope_key, provider, cooldown_until, retry_after_seconds, last_reason, hit_count, updated_at');
      if (cooldownErr) {
        // Fail open — better to sync than to freeze the scheduler on a
        // read error against the coordination table.
        console.warn('[sync-calendar-scheduled] quota_scope_read_failed:', cooldownErr.message);
      } else {
        for (const r of cooldownRows ?? []) {
          if (r?.scope_key) scopeCooldowns.set(r.scope_key as string, r as QuotaCooldownRow);
        }
      }
    }
    const scopeKeyFor = (provider: string): string => computeQuotaScopeKey({
      provider,
      clientId: provider === 'google'
        ? (Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '')
        : provider === 'microsoft'
        ? (Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '')
        : '',
    });

    let successCount = 0;
    let reconnectCount = 0;
    let skippedCount = 0;
    let failureCount = 0;
    let deferredCount = 0;
    const details: { userId: string; provider: string; outcome: string; reason?: string }[] = [];

    const now = new Date();

    for (const conn of connections || []) {
      // Honor persisted provider retry hints. A row whose next_retry_at is
      // still in the future represents a provider that explicitly asked us
      // to back off (or a bounded default we applied) — retrying it now
      // would risk a retry storm and noisy logs. Log the skip with enough
      // detail to debug, but do NOT count it as a failure.
      if (!isConnectionEligibleForSync(conn as { next_retry_at?: string | null }, now)) {
        deferredCount++;
        details.push({
          userId: conn.user_id,
          provider: conn.provider,
          outcome: 'retry_deferred',
          reason: `next_retry_at=${(conn as { next_retry_at?: string | null }).next_retry_at} retry_after_seconds=${(conn as { retry_after_seconds?: number | null }).retry_after_seconds ?? 'n/a'}`,
        });
        console.log('[sync-calendar-scheduled] ⏳ deferred', redactUserId(conn.user_id), conn.provider,
          'until', (conn as { next_retry_at?: string | null }).next_retry_at,
          'syncStatus:', (conn as { sync_status?: string | null }).sync_status ?? 'unknown');
        continue;
      }

      // Shared quota-scope guard (additive to per-row `next_retry_at`).
      // A row whose OWN retry window has elapsed can still be blocked
      // if its upstream quota bucket is cooling down.
      const scopeKey = scopeKeyFor(conn.provider);
      const scopeRow = scopeCooldowns.get(scopeKey) ?? null;
      if (!isScopeEligibleForSync(scopeRow, now)) {
        deferredCount++;
        details.push({
          userId: conn.user_id,
          provider: conn.provider,
          outcome: 'scope_deferred',
          reason: `scope_key=${scopeKey} cooldown_until=${scopeRow?.cooldown_until} reason=${scopeRow?.last_reason ?? 'n/a'}`,
        });
        console.log('[sync-calendar-scheduled] 🛑 scope deferred', redactUserId(conn.user_id), conn.provider,
          'scopeKey:', scopeKey,
          'until:', scopeRow?.cooldown_until,
          'reason:', scopeRow?.last_reason,
          'hitCount:', scopeRow?.hit_count);
        continue;
      }
      try {
        const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-calendar`;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            provider: conn.provider,
            _internalUserId: conn.user_id,
            _internalKey: serviceRoleKey,
            timezoneOffset: tzMap[conn.user_id] ?? 0,
          }),
        });

        const contentType = response.headers.get('content-type') ?? '';
        const rawBody = await response.text();

        if (!response.ok || !contentType.includes('application/json')) {
          failureCount++;
          const snippet = rawBody.slice(0, 200).replace(/\s+/g, ' ');
          const reason = `gateway_error status=${response.status} content-type=${contentType || 'none'} body=${snippet}`;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'gateway_error', reason });
          console.error('[sync-calendar-scheduled] ❌ gateway error for', redactUserId(conn.user_id),
            'status:', response.status, 'content-type:', contentType, 'body:', snippet);
          continue;
        }

        let result: Record<string, unknown>;
        try {
          result = JSON.parse(rawBody);
        } catch (parseErr) {
          failureCount++;
          const snippet = rawBody.slice(0, 200).replace(/\s+/g, ' ');
          const reason = `invalid_json status=${response.status} body=${snippet}`;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'invalid_json', reason });
          console.error('[sync-calendar-scheduled] ❌ invalid JSON for', redactUserId(conn.user_id),
            'status:', response.status, 'body:', snippet,
            'parseErr:', parseErr instanceof Error ? parseErr.message : String(parseErr));
          continue;
        }

        if (result.success === true) {
          successCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'success' });
          console.log('[sync-calendar-scheduled] ✅', redactUserId(conn.user_id), '–', (result as { eventCount?: number }).eventCount, 'events');
        } else if ((result as { reconnectRequired?: boolean }).reconnectRequired) {
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: (result as { reason?: string }).reason });
          console.warn('[sync-calendar-scheduled] ⚠️', redactUserId(conn.user_id), '– reconnect_required:', (result as { reason?: string }).reason);
        } else if ((result as { skipped?: boolean }).skipped) {
          skippedCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'skipped', reason: (result as { reason?: string }).reason });
          console.log('[sync-calendar-scheduled] ⏭️', redactUserId(conn.user_id), '– skipped:', (result as { reason?: string }).reason);
        } else {
          failureCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'failure', reason: (result as { error?: string }).error });
          console.error('[sync-calendar-scheduled] ❌', redactUserId(conn.user_id), '–', (result as { error?: string }).error);
        }
      } catch (err) {
        failureCount++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'exception', reason: msg });
        console.error('[sync-calendar-scheduled] ❌ exception for', redactUserId(conn.user_id), ':', msg);
      }
    }

    // ── COS synthesis safety net ──────────────────────────────────
    // Sweep for users who completed onboarding >30min ago but whose
    // COS profile was never generated (client closed before StageDone).
    try {
      const { data: pending } = await serviceClient
        .from('onboarding_v8_responses')
        .select('user_id')
        .not('completed_at', 'is', null)
        .is('cos_profile_generated_at', null)
        .lte('completed_at', new Date(Date.now() - 30 * 60_000).toISOString())
        .limit(5);

      if (pending && pending.length > 0) {
        console.log(`[sync-calendar-scheduled] COS sweep: ${pending.length} pending profiles`);
        for (const row of pending) {
          try {
            await serviceClient.functions.invoke('synthesize-cos-profile', {
              body: { userId: row.user_id },
            });
            console.log(`[sync-calendar-scheduled] COS synthesis triggered for:`, redactUserId(row.user_id));
          } catch (e) {
            console.warn(`[sync-calendar-scheduled] COS synthesis failed for:`, redactUserId(row.user_id), e instanceof Error ? e.message : String(e));
          }
        }
      }
    } catch (e) {
      console.warn('[sync-calendar-scheduled] COS sweep error:', e instanceof Error ? e.message : String(e));
    }

    console.log(`[sync-calendar-scheduled] Done. success=${successCount} reconnect=${reconnectCount} skipped=${skippedCount} deferred=${deferredCount} failure=${failureCount}`);

    return new Response(
      JSON.stringify({ success: true, totalConnections: total, successCount, reconnectCount, skippedCount, deferredCount, failureCount, details }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-calendar-scheduled] Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
