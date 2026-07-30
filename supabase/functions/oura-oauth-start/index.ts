/**
 * Oura OAuth — start.
 *
 * Authenticated POST. Returns the Oura authorize URL the client should open.
 * We persist a one-time `oauth_state` nonce + expiry on the oura_connections
 * row so the callback can verify the inbound state.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

const OURA_AUTHORIZE = "https://cloud.ouraring.com/oauth/authorize";
const OURA_SCOPES = "daily heartrate workout personal session daily_readiness daily_sleep sleep";

function genNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const clientId = Deno.env.get("OURA_CLIENT_ID");
    const redirectUri = Deno.env.get("OURA_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "oura_oauth_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const reqBody = await req.json().catch(() => ({}));
    const redirectPath = typeof reqBody?.redirectPath === 'string' ? reqBody.redirectPath : '/connected-data';

    const nonce = genNonce();
    const state = `${userId}:${nonce}:${encodeURIComponent(redirectPath)}`;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString(); // 10 min

    // Upsert a (possibly-pending) row so the callback can find it. Keep is_active=false
    // until the callback exchanges the code successfully.
    const { data: existing } = await db
      .from("oura_connections")
      .select("id, is_active")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("oura_connections")
        .update({
          oauth_state: nonce,
          oauth_state_expires_at: expiresAt,
        })
        .eq("id", existing.id);
    } else {
      await db.from("oura_connections").insert({
        user_id: userId,
        is_active: false,
        connection_status: "connecting",
        sync_status: "unknown",
        oauth_state: nonce,
        oauth_state_expires_at: expiresAt,
      });
    }

    const url = new URL(OURA_AUTHORIZE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OURA_SCOPES);
    url.searchParams.set("state", state);

    console.log("[oura-oauth-start] generated authorize URL for", redactUserId(userId));
    return new Response(JSON.stringify({ authorizeUrl: url.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[oura-oauth-start] error:", err);
    return new Response(JSON.stringify({ error: "oauth_start_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
