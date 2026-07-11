import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if ('errorResponse' in auth) return auth.errorResponse;
    const userId = auth.userId;

    const { device_token, platform } = await req.json();
    if (!device_token || !platform) {
      return new Response(JSON.stringify({ error: 'Missing device_token or platform' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate APNs token shape. In production we observed malformed 160-char
    // hex strings being persisted and later rejected by APNs as BadDeviceToken.
    // Accept only canonical APNs byte lengths exposed as hex.
    const normalizedToken = typeof device_token === 'string' ? device_token.trim().toLowerCase() : device_token;
    if (platform === 'ios') {
      const allowedHexLengths = new Set([64, 72, 128]);
      const isValid =
        typeof normalizedToken === 'string' &&
        /^[0-9a-f]+$/.test(normalizedToken) &&
        allowedHexLengths.has(normalizedToken.length);
      if (!isValid) {
        console.warn(`[register-device-token] Rejected malformed iOS token for ${redactUserId(userId)}: length=${device_token?.length}`);
        return new Response(JSON.stringify({
          error: 'Invalid iOS device token format (expected canonical APNs hex token)',
          length: typeof device_token === 'string' ? device_token.length : null,
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Cross-user ownership transfer (Batch A / privacy):
    // If this device_token was previously registered by a DIFFERENT user
    // (e.g. two accounts on the same phone), deactivate the other user's
    // row FIRST so smart-nudges cannot fan the previous owner's copy out
    // to this device. Belt-and-suspenders: a partial unique index on
    // (device_token) WHERE is_active enforces this at DB level.
    const { error: crossUserDeactErr, count: crossUserDeactivated } = await supabase
      .from('notification_device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('device_token', normalizedToken)
      .neq('user_id', userId)
      .eq('is_active', true);
    if (crossUserDeactErr) {
      console.error('[register-device-token] cross-user deactivate failed:', crossUserDeactErr.message);
      throw crossUserDeactErr;
    }
    if ((crossUserDeactivated ?? 0) > 0) {
      console.warn(
        `[register-device-token] Transferred ownership of token prefix=${normalizedToken.substring(0, 12)} ` +
        `from ${crossUserDeactivated} prior user(s) to ${redactUserId(userId)}`,
      );
    }

    // Single-active-token per user+platform: deactivate other tokens this
    // user still holds on this device class.
    await supabase
      .from('notification_device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', platform)
      .neq('device_token', normalizedToken)
      .eq('is_active', true);

    // Upsert the current token as the active one for this user
    const { error } = await supabase
      .from('notification_device_tokens')
      .upsert(
        {
          user_id: userId,
          device_token: normalizedToken,
          platform,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_token' }
      );

    if (error) throw error;

    // 3. Hard-delete this user's tokens that have been inactive for > 7 days
    //    (keeps the table tight; periodic cron also runs this globally)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: pruneErr, count: prunedCount } = await supabase
      .from('notification_device_tokens')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', false)
      .lt('updated_at', sevenDaysAgo);
    if (pruneErr) {
      console.warn('[register-device-token] Prune failed (non-fatal):', pruneErr.message);
    }

    console.log(`[register-device-token] Token registered for ${redactUserId(userId)} (${platform}); pruned ${prunedCount ?? 0} stale tokens`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    console.error('[register-device-token] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
