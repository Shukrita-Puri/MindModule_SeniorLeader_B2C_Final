import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normalize a .p8 private key from env storage into clean base64 DER.
 */
function normalizeP8Key(raw: string): string {
  let key = raw
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\s\r\n]+/g, '')
    .replace(/-/g, '+').replace(/_/g, '/');
  const pad = key.length % 4;
  if (pad === 2) key += '==';
  else if (pad === 3) key += '=';
  if (key.length === 0) throw new Error('[APNs] APNS_P8_KEY empty after normalization');
  if (!/^[A-Za-z0-9+/=]+$/.test(key)) {
    throw new Error(`[APNs] APNS_P8_KEY has invalid base64 chars (len=${key.length})`);
  }
  return key;
}

/** Create ES256 JWT for APNs token-based auth */
async function createApnsJwt(p8Key: string, keyId: string, teamId: string): Promise<string> {
  const cleanKey = normalizeP8Key(p8Key);
  console.log(`[APNs] Key normalized OK: ${cleanKey.length} base64 chars`);
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
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const callerUserId = auth.userId;

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

    // 2. Get the authenticated caller's active iOS device tokens only.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: tokens, error: tokErr } = await supabase
      .from("notification_device_tokens")
      .select("user_id, device_token, platform, is_active, updated_at")
      .eq("user_id", callerUserId)
      .eq("platform", "ios")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({
        error: "No iOS device tokens found",
        target_user_id: callerUserId,
      }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[test-push] Found ${tokens.length} active iOS token(s) for authenticated caller`);

    // 3. Create APNs JWT
    const jwt = await createApnsJwt(apnsKey, apnsKeyId, apnsTeamId);

    // 4. Send test push to each token
    const results: Array<{ user_id: string; token_prefix: string; token_length: number; status: number; response: string }> = [];

    for (const t of tokens) {
      const ttlSeconds = 3600;
      const expirationTs = Math.floor(Date.now() / 1000) + ttlSeconds;
      // Unique per request — previous implementation reused the same collapse-id
      // for the whole day, so repeated taps of "Send Remote Push Test"
      // collapsed silently into one notification on device.
      const collapseId = `test_push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        aps: {
          alert: {
            title: "🔔 Mind Module Test",
            body: `Test push @ ${new Date().toISOString().slice(11, 19)} UTC — if you see this, delivery is working.`,
          },
          sound: "default",
          badge: 1,
          // 'mutable-content' intentionally omitted — requires a Notification
          // Service Extension which this app does not ship. Without one some
          // iOS versions silently suppress the alert.
          'interruption-level': 'time-sensitive',
        },
        notification_type: "test_push",
        expiration_ts: String(expirationTs),
      };

      const url = `https://${apnsHost}/3/device/${t.device_token}`;
      console.log(`[test-push] Sending to ${apnsHost} | token=${t.device_token.substring(0, 12)}... | user=${t.user_id} | ttl=${ttlSeconds}s | collapse=${collapseId}`);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `bearer ${jwt}`,
          "apns-topic": apnsBundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": String(expirationTs),
          "apns-collapse-id": collapseId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resBody = await res.text();
      const apnsId = res.headers.get('apns-id');
      let apnsReason: string | null = null;
      try { apnsReason = resBody ? (JSON.parse(resBody).reason ?? null) : null; } catch { /* ignore */ }
      console.log(`[test-push] APNs response: status=${res.status} apns-id=${apnsId} reason=${apnsReason ?? '-'} body=${resBody || "(empty)"} token=${t.device_token.substring(0, 12)}...`);

      // Best-effort diagnostic row — APNs 200 only means accepted, not delivered.
      try {
        await supabase.from('notification_log').insert({
          user_id: t.user_id,
          notification_type: 'test_push',
          sent_at: new Date().toISOString(),
          delivery_state: res.status === 200 ? 'apns_accepted' : 'apns_rejected',
          payload: {
            apns_status: res.status,
            apns_reason: apnsReason,
            apns_id: apnsId,
            apns_host: apnsHost,
            apns_topic: apnsBundleId,
            apns_env: apnsEnv,
            apns_collapse_id: collapseId,
            apns_token_prefix: t.device_token.substring(0, 12),
            source: 'test-push',
          },
        });
      } catch (logErr) {
        console.warn('[test-push] notification_log insert failed', logErr);
      }

      results.push({
        user_id: t.user_id,
        token_prefix: t.device_token.substring(0, 12) + "...",
        token_length: t.device_token.length,
        status: res.status,
        // Important: 200 means "APNs accepted" — not "delivered/displayed".
        result: res.status === 200 ? 'apns_accepted' : 'apns_rejected',
        apns_id: apnsId,
        apns_reason: apnsReason,
        response: resBody || "(empty)",
        apns_expiration: expirationTs,
        apns_collapse_id: collapseId,
      });
    }

    return new Response(JSON.stringify({
      apns_host: apnsHost,
      apns_topic: apnsBundleId,
      apns_env: apnsEnv,
      tokens_sent: results.length,
      note: "status 200 = APNs accepted the request. It does not confirm the device displayed the alert. Check device Notification Center + notification_log row.",
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
