import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Create ES256 JWT for APNs token-based auth */
async function createApnsJwt(p8Key: string, keyId: string, teamId: string): Promise<string> {
  const cleanKey = p8Key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(cleanKey), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = btoa(JSON.stringify({ alg: "ES256", kid: keyId })).replace(/=/g, "");
  const now = Math.floor(Date.now() / 1000);
  const claims = btoa(JSON.stringify({ iss: teamId, iat: now })).replace(/=/g, "");
  const signingInput = `${header}.${claims}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput)
    )
  );
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${signingInput}.${sigB64}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Read APNs credentials
    const apnsKey = Deno.env.get("APNS_P8_KEY");
    const apnsKeyId = Deno.env.get("APNS_KEY_ID");
    const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
    const apnsBundleId = Deno.env.get("APNS_BUNDLE_ID") || "com.moonshot.mindmoduleapp";
    const apnsEnv = Deno.env.get("APNS_ENVIRONMENT") || "development";
    const apnsHost = apnsEnv === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

    if (!apnsKey || !apnsKeyId || !apnsTeamId) {
      const missing = [!apnsKey && "APNS_P8_KEY", !apnsKeyId && "APNS_KEY_ID", !apnsTeamId && "APNS_TEAM_ID"].filter(Boolean);
      return new Response(JSON.stringify({ error: "Missing APNs secrets", missing }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[test-push] APNs config: host=${apnsHost} topic=${apnsBundleId} env=${apnsEnv}`);

    // 2. Get all active iOS device tokens
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: tokens, error: tokErr } = await supabase
      .from("notification_device_tokens")
      .select("user_id, device_token, platform")
      .eq("is_active", true)
      .eq("platform", "ios");

    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ error: "No active iOS device tokens found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[test-push] Found ${tokens.length} active iOS token(s)`);

    // 3. Create APNs JWT
    const jwt = await createApnsJwt(apnsKey, apnsKeyId, apnsTeamId);

    // 4. Send test push to each token
    const results: Array<{ user_id: string; token_prefix: string; token_length: number; status: number; response: string }> = [];

    for (const t of tokens) {
      const payload = {
        aps: {
          alert: {
            title: "🔔 Mind Module Test",
            body: "Push notifications are working! This is a test from your notification pipeline.",
          },
          sound: "default",
          badge: 1,
        },
        notification_type: "test_push",
      };

      const url = `https://${apnsHost}/3/device/${t.device_token}`;
      console.log(`[test-push] Sending to ${apnsHost} | token=${t.device_token.substring(0, 12)}... (${t.device_token.length} chars) | user=${t.user_id}`);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `bearer ${jwt}`,
          "apns-topic": apnsBundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resBody = await res.text();
      console.log(`[test-push] APNs response: status=${res.status} body=${resBody || "(empty)"} token=${t.device_token.substring(0, 12)}...`);

      results.push({
        user_id: t.user_id,
        token_prefix: t.device_token.substring(0, 12) + "...",
        token_length: t.device_token.length,
        status: res.status,
        response: resBody || "success",
      });
    }

    return new Response(JSON.stringify({
      apns_host: apnsHost,
      apns_topic: apnsBundleId,
      apns_env: apnsEnv,
      tokens_sent: results.length,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[test-push] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
