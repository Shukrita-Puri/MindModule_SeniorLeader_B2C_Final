import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate via Auth0 JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token via Auth0 userinfo
    const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
    if (!auth0Domain) {
      return new Response(JSON.stringify({ error: 'Auth not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userInfoRes = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userInfoRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userInfo = await userInfoRes.json();
    const userId = userInfo.sub;

    const { device_token, platform } = await req.json();
    if (!device_token || !platform) {
      return new Response(JSON.stringify({ error: 'Missing device_token or platform' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate APNs token shape: 64 hex chars. Anything else (e.g. 160-char
    // double-encoded historical artifact) is silently rejected by APNs as
    // BadDeviceToken, so don't persist it.
    if (platform === 'ios') {
      const isValid = typeof device_token === 'string' && /^[0-9a-fA-F]{64}$/.test(device_token);
      if (!isValid) {
        console.warn(`[register-device-token] Rejected malformed iOS token for ${userId}: length=${device_token?.length}`);
        return new Response(JSON.stringify({
          error: 'Invalid iOS device token format (expected 64 hex chars)',
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

    // Single-active-token policy:
    // 1. Deactivate every other token for this user on this platform (only one active per device class)
    await supabase
      .from('notification_device_tokens')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('platform', platform)
      .neq('device_token', device_token);

    // 2. Upsert the current token as the active one
    const { error } = await supabase
      .from('notification_device_tokens')
      .upsert(
        {
          user_id: userId,
          device_token,
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

    console.log(`[register-device-token] Token registered for ${userId} (${platform}); pruned ${prunedCount ?? 0} stale tokens`);

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
