/**
 * sync-profile: Upserts Auth0 user data into Supabase profiles.
 * Called after every successful Auth0 login/callback.
 * 
 * - Verifies Auth0 JWT (server-side trust)
 * - Extracts user info from token claims + Auth0 /userinfo
 * - Upserts into profiles using Auth0 `sub` as primary key
 * - Never trusts client-provided userId for writes
 * - Idempotent: safe to call multiple times
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify Auth0 JWT — this is our source of truth for identity
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0JWT(authHeader);

    // 2. Get user details from Auth0 /userinfo (has email, name, picture)
    const token = authHeader!.replace("Bearer ", "");
    const domain = Deno.env.get("VITE_AUTH0_DOMAIN");
    if (!domain) {
      throw new Error("VITE_AUTH0_DOMAIN not configured");
    }

    let email: string | null = null;
    let name: string | null = null;
    let picture: string | null = null;

    try {
      const userinfoRes = await fetch(`https://${domain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userinfoRes.ok) {
        const info = await userinfoRes.json();
        email = info.email || null;
        name = info.name || null;
        picture = info.picture || null;
      } else {
        console.warn(
          `[sync-profile] /userinfo returned ${userinfoRes.status}, proceeding with token claims only`
        );
      }
    } catch (err) {
      console.warn("[sync-profile] /userinfo fetch failed, proceeding:", err);
    }

    // 3. Parse request body for any client-provided hints (non-authoritative)
    let clientHints: Record<string, unknown> = {};
    try {
      clientHints = await req.json();
    } catch {
      // No body is fine
    }

    // Use client hints only as fallback when /userinfo didn't provide data
    if (!email && clientHints.email) email = String(clientHints.email);
    if (!name && clientHints.name) name = String(clientHints.name);
    if (!picture && clientHints.picture) picture = String(clientHints.picture);

    if (!email) {
      console.error("[sync-profile] No email available for user:", userId);
      return new Response(
        JSON.stringify({ error: "Email is required for profile sync" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Upsert profile using service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: name,
          avatar_url: picture,
          last_login_at: now,
          updated_at: now,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false, // Always update on conflict
        }
      )
      .select("id, email, full_name, subscription_status, subscription_plan, onboarding_completed_at, mental_fitness_baseline, user_archetype, subscription_tier, trial_ends_at, subscription_current_period_start, subscription_current_period_end, subscription_canceled_at")
      .single();

    if (error) {
      console.error("[sync-profile] Upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Profile sync failed", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[sync-profile] ✅ Profile synced for:", userId);

    return new Response(
      JSON.stringify({
        synced: true,
        profile: data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-profile] Fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
