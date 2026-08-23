import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateApnsEnvironment } from "../_shared/apns-env.ts";
import { createApnsJwt, sendApnsSilentPush } from "../_shared/apns-sender.ts";
import { resolveEffectiveTimezone, localParts } from "../_shared/effective-timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== Deno.env.get("CRON_SHARED_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apnsEnv = validateApnsEnvironment();
  if (!apnsEnv.ok) {
    console.error(`[early-morning-sync] Config error: ${apnsEnv.reason}`);
    return new Response(JSON.stringify({ error: apnsEnv.reason }), { status: 500, headers: corsHeaders });
  }

  const p8Key = Deno.env.get("APNS_P8_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!p8Key || !keyId || !teamId) {
    console.error(`[early-morning-sync] Config error: APNs credentials missing (P8_KEY, KEY_ID, or TEAM_ID)`);
    return new Response(JSON.stringify({ error: "APNs credentials missing" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // Active iOS/iPadOS device tokens live in notification_device_tokens.
    const { data: tokenRows, error: tokensErr } = await supabase
      .from("notification_device_tokens")
      .select("user_id, device_token, platform")
      .eq("is_active", true)
      .in("platform", ["ios", "ipados"]);

    if (tokensErr) throw tokensErr;

    const byUser = new Map<string, string[]>();
    for (const row of tokenRows || []) {
      if (!row.user_id || !row.device_token) continue;
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.device_token);
      byUser.set(row.user_id, list);
    }

    if (byUser.size === 0) {
      return new Response(JSON.stringify({ success: true, sentCount: 0, results: [] }), { headers: corsHeaders });
    }

    const { data: profileRows, error: usersErr } = await supabase
      .from("profiles")
      .select("id, home_timezone, current_timezone")
      .in("id", Array.from(byUser.keys()));

    if (usersErr) throw usersErr;

    const jwt = await createApnsJwt(p8Key, keyId, teamId);
    let sentCount = 0;
    const results = [];

    for (const user of profileRows || []) {
      const iosTokens = byUser.get(user.id) ?? [];
      if (iosTokens.length === 0) continue;

      const tzInfo = await resolveEffectiveTimezone(supabase as any, user.id, user);
      const tz = tzInfo.circadianTimezone || tzInfo.effectiveTimezone;
      const parts = localParts(tz);
      
      // Target: 04:45 local. Give a 15 min window (04:45 to 04:59)
      if ((parts.hour === 4 && parts.minute >= 45) || (parts.hour === 5 && parts.minute <= 30)) {
        // Check if they actually have a native integration connected
        const [watchRes, calRes] = await Promise.all([
          supabase.from("user_integrations").select("watch_connection_status").eq("user_id", user.id).maybeSingle(),
          supabase.from("calendar_connections").select("id").eq("user_id", user.id).eq("provider", "apple").limit(1)
        ]);
        
        const hasWatch = watchRes.data?.watch_connection_status === 'connected';
        const hasAppleCal = calRes.data != null && calRes.data.length > 0;
        if (!hasWatch && !hasAppleCal) continue;

        const localDate = parts.localDate;
        
        // Fetch all successful sync logs for this user today
        const { data: existingLogs } = await supabase
          .from("notification_log")
          .select("notification_type")
          .eq("user_id", user.id)
          .like("notification_type", `early_morning_sync_${localDate}_%`);
          
        const successfulTokens = new Set((existingLogs || []).map(l => l.notification_type));
        
        console.log(`[early-morning-sync] Triggering silent push for ${user.id} at local time ${parts.hour}:${parts.minute}`);
        
        for (const deviceToken of iosTokens) {
          // Use SHA-256 of the token to prevent storing raw APNs tokens in logs
          const tokenData = new TextEncoder().encode(deviceToken);
          const hashBuffer = await crypto.subtle.digest('SHA-256', tokenData);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
            
          const dedupeKey = `early_morning_sync_${localDate}_${hashHex}`;
          
          if (successfulTokens.has(dedupeKey)) continue;
          
          const res = await sendApnsSilentPush(
            deviceToken,
            apnsEnv.bundleId,
            jwt,
            { action: "sync_all" },
            apnsEnv.apnsHost
          );
          
          const masked = deviceToken.length > 10 ? `${deviceToken.substring(0, 8)}...` : "***";
          results.push({ userId: user.id, success: res.success, reason: res.reason });
          
          if (res.success) {
            sentCount++;
            await supabase.from("notification_log").insert({
              user_id: user.id,
              notification_type: dedupeKey,
              variant_id: "silent_sync",
              payload: { apns_status: res.status, apns_token_prefix: masked },
              delivery_state: "accepted",
              delivered_at: new Date().toISOString()
            });
          } else if (res.status === 410 || res.reason === "BadDeviceToken") {
            await supabase
              .from("notification_device_tokens")
              .update({ is_active: false })
              .eq("device_token", deviceToken);
          }
        }
      }
    }


    return new Response(JSON.stringify({ success: true, sentCount, results }), { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
