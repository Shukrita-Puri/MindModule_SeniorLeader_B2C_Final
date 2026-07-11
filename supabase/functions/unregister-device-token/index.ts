import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

/**
 * Batch A — Secure device-token unregister on logout.
 *
 * Deactivates (never deletes) `notification_device_tokens` rows so
 * smart-nudges immediately stops targeting this device for the caller.
 *
 * Payload (all optional):
 *   { device_token?: string }  // if provided, deactivate that specific
 *                              // token when it is owned by the caller.
 *                              // Otherwise deactivate ALL of the caller's
 *                              // active tokens (multi-device wipe on
 *                              // account sign-out — other devices will
 *                              // re-register on next resume via
 *                              // useDeviceTokenRegistration).
 *
 * Auth: real Auth0 JWT required. The caller can only touch their OWN
 * tokens. Impersonation headers are ignored (auth.ts already forbids
 * the impersonation path from doing writes on behalf of a target unless
 * the admin explicitly attaches x-impersonation-token; even then, only
 * the impersonated subject's rows can be modified).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if ('errorResponse' in auth) return auth.errorResponse;
    const userId = auth.userId;

    let deviceToken: string | null = null;
    try {
      const body = await req.json();
      const raw = body?.device_token;
      if (typeof raw === 'string' && raw.trim().length > 0) {
        deviceToken = raw.trim().toLowerCase();
      }
    } catch {
      // empty body is fine
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const query = supabase
      .from('notification_device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true);

    const { error, count } = deviceToken
      ? await query.eq('device_token', deviceToken)
      : await query;

    if (error) throw error;

    console.log(
      `[unregister-device-token] Deactivated ${count ?? 0} token(s) for ${redactUserId(userId)}` +
      `${deviceToken ? ` (prefix=${deviceToken.substring(0, 12)})` : ' (all)'}`,
    );

    return new Response(
      JSON.stringify({ success: true, deactivated: count ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[unregister-device-token] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});