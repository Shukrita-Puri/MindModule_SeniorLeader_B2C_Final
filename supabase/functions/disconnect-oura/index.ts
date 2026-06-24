/**
 * Oura — disconnect.
 *
 * Authenticated POST. Marks the caller's active Oura connection as
 * disconnected and invalidates the stored OAuth tokens. We deliberately
 * keep historical wearable_data rows so prior readiness signals stay
 * intact; only the live connection + token references are torn down.
 *
 * Never logs access_token, refresh_token, or client_secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find any rows for this user (we mark them all inactive in one shot).
    const { data: rows, error: selErr } = await db
      .from("oura_connections")
      .select("id, encrypted_access_token_id, encrypted_refresh_token_id")
      .eq("user_id", userId);

    if (selErr) {
      console.error("[disconnect-oura] select failed:", selErr.message);
      return new Response(JSON.stringify({ ok: false, error: "lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    let cleared = 0;

    for (const row of rows ?? []) {
      // Best-effort: drop the vault secrets so the tokens cannot be re-used.
      for (const secretId of [row.encrypted_access_token_id, row.encrypted_refresh_token_id]) {
        if (!secretId) continue;
        const { error: vaultErr } = await db
          .schema("vault")
          .from("secrets")
          .delete()
          .eq("id", secretId);
        if (vaultErr) {
          console.warn("[disconnect-oura] vault delete failed for one secret");
        }
      }

      const { error: updErr } = await db
        .from("oura_connections")
        .update({
          is_active: false,
          connection_status: "disconnected",
          sync_status: "unknown",
          oauth_state: null,
          oauth_state_expires_at: null,
          encrypted_access_token_id: null,
          encrypted_refresh_token_id: null,
          access_token_expires_at: null,
          last_error: null,
          last_error_at: null,
          updated_at: now,
        })
        .eq("id", row.id);

      if (updErr) {
        console.warn("[disconnect-oura] update failed for connection row");
      } else {
        cleared++;
      }
    }

    console.log("[disconnect-oura] disconnected", { userId, cleared });
    return new Response(JSON.stringify({ ok: true, cleared }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[disconnect-oura] error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});