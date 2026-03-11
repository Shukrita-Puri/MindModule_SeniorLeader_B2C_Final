/**
 * sync-profile: Upserts Auth0 user data into Supabase profiles.
 * Called after every successful Auth0 login/callback.
 * 
 * Two-column name approach:
 * - auth_name: Always synced from Auth0 /userinfo (never user-editable)
 * - display_name: Only set on initial profile creation, never overwritten by sync
 * - full_name: Deprecated, no longer written
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

        // TIER 3: Server-side cross-check — verify JWT sub matches /userinfo sub
        if (info.sub && info.sub !== userId) {
          console.error("[sync-profile] 🚨 IDENTITY MISMATCH — JWT sub:", userId, "userinfo sub:", info.sub);
          return new Response(
            JSON.stringify({
              error: "Token identity mismatch detected",
              detail: "JWT subject does not match /userinfo subject. Possible stale session.",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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

    // 4. Check if profile already exists (to preserve display_name)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single();

    const now = new Date().toISOString();
    const isNewProfile = !existingProfile;

    // Build upsert data — auth_name always updated, display_name only on new profiles
    const upsertData: Record<string, unknown> = {
      id: userId,
      email,
      auth_name: name,
      avatar_url: picture,
      last_login_at: now,
      updated_at: now,
    };

    // Only set display_name on initial profile creation
    if (isNewProfile) {
      upsertData.display_name = name;
    }

    // Beta invite lookup — runs on EVERY sync, not just new profiles.
    // Matches both 'invited' and 'activated' status so that returning
    // users whose profile already exists still get beta fields populated.
    if (email) {
      const { data: invite } = await supabaseAdmin
        .from("beta_invites")
        .select("id, beta_expires_at, status")
        .eq("email", email.toLowerCase())
        .in("status", ["invited", "activated"])
        .order("beta_expires_at", { ascending: false })
        .limit(1)
        .single();

      if (invite && new Date(invite.beta_expires_at) > new Date()) {
        upsertData.beta_user = true;
        upsertData.beta_expires_at = invite.beta_expires_at;
        console.log("[sync-profile] 🎉 Beta invite applied for:", email, "status:", invite.status);

        // Mark invite as activated if it was still in 'invited' state
        if (invite.status === "invited") {
          supabaseAdmin
            .from("beta_invites")
            .update({ status: "activated" })
            .eq("id", invite.id)
            .then(({ error: updateErr }) => {
              if (updateErr) console.warn("[sync-profile] Failed to update beta_invites status:", updateErr);
            });
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert(upsertData, {
        onConflict: "id",
        ignoreDuplicates: false,
      })
      .select("id, email, display_name, auth_name, full_name, subscription_status, subscription_plan, onboarding_completed_at, mental_fitness_baseline, user_archetype, subscription_tier, trial_ends_at, subscription_current_period_start, subscription_current_period_end, subscription_canceled_at, subscription_cancel_at, beta_user, beta_expires_at, stripe_customer_id")
      .single();

    if (error) {
      console.error("[sync-profile] Upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Profile sync failed", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[sync-profile] ✅ Profile synced for:", userId, "isNew:", isNewProfile);

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
