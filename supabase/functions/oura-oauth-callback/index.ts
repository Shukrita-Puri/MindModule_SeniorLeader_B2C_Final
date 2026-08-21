/**
 * Oura OAuth — callback.
 *
 * Public endpoint (Oura redirects user's browser here). Validates state,
 * exchanges the code for tokens, stores them via vault helpers, kicks off
 * an initial sync (fire-and-forget), then redirects back into the app.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*, x-mm-client-platform",
};

const OURA_TOKEN = "https://api.ouraring.com/oauth/token";

function appReturnUrl(success: boolean, reason?: string, redirectPath?: string): string {
  const frontend = Deno.env.get("FRONTEND_URL") || "https://mindmoduleme.lovable.app";
  const path = redirectPath && redirectPath.startsWith("/") ? redirectPath : "/profile";
  const params = new URLSearchParams();
  params.set("oura_connected", success ? "true" : "false");
  params.set("provider", "oura");
  params.set("redirectPath", path);
  if (reason) params.set("reason", reason);
  return `${frontend.replace(/\/$/, "")}/oauth-done?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.warn("[oura-oauth-callback] OAuth error from Oura:", error);
      return Response.redirect(appReturnUrl(false, error), 302);
    }
    if (!code || !state || !state.includes(":")) {
      return Response.redirect(appReturnUrl(false, "missing_code_or_state"), 302);
    }

    const stateParts = state.split(":");
    const userId = stateParts[0];
    const nonce = stateParts[1];
    let customRedirectPath: string | undefined = undefined;
    if (stateParts[2]) {
      try { customRedirectPath = decodeURIComponent(stateParts[2]); } catch {}
    }
    const platform = stateParts[3] || "web";

    const clientId = Deno.env.get("OURA_CLIENT_ID");
    const clientSecret = Deno.env.get("OURA_CLIENT_SECRET");
    const redirectUri = Deno.env.get("OURA_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return Response.redirect(appReturnUrl(false, "not_configured", customRedirectPath, platform), 302);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify state nonce
    const { data: row } = await db
      .from("oura_connections")
      .select("id, oauth_state, oauth_state_expires_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row || row.oauth_state !== nonce) {
      console.warn("[oura-oauth-callback] state mismatch for user", redactUserId(userId));
      return Response.redirect(appReturnUrl(false, "state_mismatch", customRedirectPath, platform), 302);
    }
    if (row.oauth_state_expires_at && new Date(row.oauth_state_expires_at) < new Date()) {
      return Response.redirect(appReturnUrl(false, "state_expired", customRedirectPath, platform), 302);
    }

    // Exchange code -> tokens
    const tokenRes = await fetch(OURA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error("[oura-oauth-callback] token exchange failed:", tokenRes.status, text);
      return Response.redirect(appReturnUrl(false, `token_exchange_${tokenRes.status}`, customRedirectPath, platform), 302);
    }

    const tok = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    const expiresAt = new Date(Date.now() + ((tok.expires_in ?? 86400) * 1000)).toISOString();

    await db
      .from("oura_connections")
      .update({
        is_active: true,
        connection_status: "connected",
        sync_status: "unknown",
        oauth_state: null,
        oauth_state_expires_at: null,
        last_error: null,
        last_error_at: null,
      })
      .eq("id", row.id);

    // Store tokens via vault helpers
    await db.rpc("store_oura_access_token", {
      _connection_id: row.id,
      _token: tok.access_token,
      _expires_at: expiresAt,
    });
    if (tok.refresh_token) {
      await db.rpc("store_oura_refresh_token", {
        _connection_id: row.id,
        _token: tok.refresh_token,
      });
    }

    // Fire-and-forget initial sync
    try {
      const projectUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (projectUrl && serviceKey) {
        fetch(`${projectUrl}/functions/v1/sync-oura`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "x-admin-bypass": serviceKey,
          },
          body: JSON.stringify({ user_id: userId, source: "callback_initial" }),
        }).catch((e) => console.warn("[oura-oauth-callback] initial sync kick failed:", e));
      }
    } catch (e) {
      console.warn("[oura-oauth-callback] initial sync kick threw:", e);
    }

    return Response.redirect(appReturnUrl(true, undefined, customRedirectPath, platform), 302);
  } catch (err) {
    console.error("[oura-oauth-callback] error:", err);
    return Response.redirect(appReturnUrl(false, "internal_error", customRedirectPath, platform), 302);
  }
});
