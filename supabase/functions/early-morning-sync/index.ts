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
    return new Response(JSON.stringify({ error: apnsEnv.reason }), { status: 500, headers: corsHeaders });
  }

  const p8Key = Deno.env.get("APNS_P8_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!p8Key || !keyId || !teamId) {
    return new Response(JSON.stringify({ error: "APNs credentials missing" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // Fetch all users who have an iOS push token
    const { data: users, error: usersErr } = await supabase
      .from("profiles")
      .select("id, home_timezone, current_timezone, push_tokens(token, platform)");
      
    if (usersErr) throw usersErr;

    const jwt = await createApnsJwt(p8Key, keyId, teamId);
    let sentCount = 0;
    const results = [];

    for (const user of users || []) {
      const iosTokens = (user.push_tokens || []).filter((t: any) => t.platform === "ios" || t.platform === "ipados");
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
        
        for (const tokenObj of iosTokens) {
          // Use SHA-256 of the token to prevent storing raw APNs tokens in logs
          const tokenData = new TextEncoder().encode(tokenObj.token);
          const hashBuffer = await crypto.subtle.digest('SHA-256', tokenData);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
            
          const dedupeKey = `early_morning_sync_${localDate}_${hashHex}`;
          
          if (successfulTokens.has(dedupeKey)) continue;
          
          const res = await sendApnsSilentPush(
            tokenObj.token,
            apnsEnv.bundleId,
            jwt,
            { action: "sync_all" },
            apnsEnv.apnsHost
          );
          
          const masked = tokenObj.token.length > 10 ? `${tokenObj.token.substring(0, 8)}...` : "***";
          results.push({ userId: user.id, token: masked, success: res.success, reason: res.reason });
          
          if (res.success) {
            sentCount++;
            await supabase.from("notification_log").insert({
              user_id: user.id,
              notification_type: dedupeKey,
              variant_id: "silent_sync",
              outcome: "sent",
              delivered_at: new Date().toISOString()
            });
          } else if (res.status === 410 || res.reason === "BadDeviceToken") {
            await supabase.from("push_tokens").delete().eq("token", tokenObj.token);
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
