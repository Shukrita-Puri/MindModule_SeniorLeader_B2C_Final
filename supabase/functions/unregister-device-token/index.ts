import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { hashTokenPrefix } from "../_shared/token-hash.ts";

/**
 * Batch A/B — Secure device-token unregister on logout.
 *
 * Deactivates (never deletes) exactly ONE `notification_device_tokens`
 * row so smart-nudges immediately stops targeting the caller's CURRENT
 * device — without touching that user's other active devices (iPad B,
 * second iPhone, etc.).
 *
 * Payload (required):
 *   { device_token: string }  // the APNs token of the device that is
 *                             // signing out. Backend deactivates only
 *                             // the row matching (auth.user_id,
 *                             // device_token, is_active=true).
 *
 * We NEVER wipe every token for a user here. That behaviour was a
 * multi-device regression: signing out on iPhone A silently killed
 * iPad B's push. Callers that legitimately want an account-wide wipe
 * must call the admin cleanup path.
 *
 * Auth: real Auth0 JWT required. The caller can only touch their OWN
 * tokens (scoped by user_id AND device_token). Raw token is never
 * logged — only an irreversible SHA-256 hash prefix (see
 * _shared/token-hash.ts) is emitted for correlation.
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
      // fall through to the required-token guard below
    }

    if (!deviceToken) {
      // Batch B multi-device safety: refuse to wipe every token for the
      // user. The client MUST identify which device is signing out.
      console.warn(
        `[unregister-device-token] Rejected: missing device_token for ${redactUserId(userId)}`
      );
      return new Response(
        JSON.stringify({
          error: 'device_token is required',
          hint: 'Send the APNs token of the device that is signing out.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error, count } = await supabase
      .from('notification_device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('device_token', deviceToken);

    if (error) throw error;

    // Privacy: log only an irreversible SHA-256 hash prefix — never
    // the raw token nor its raw prefix. See _shared/token-hash.ts.
    const tokenHash = await hashTokenPrefix(deviceToken);
    console.log(
      `[unregister-device-token] Deactivated ${count ?? 0} token(s) for ${redactUserId(userId)} (${tokenHash})`,
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