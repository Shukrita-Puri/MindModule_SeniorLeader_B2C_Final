/**
 * update-display-name
 * Allows an authenticated user to set or clear their profiles.display_name.
 * Empty / null input clears the override, falling back to auth_name / full_name.
 *
 * Validation:
 *  - trimmed
 *  - max 40 chars
 *  - allowed chars: unicode letters, spaces, hyphens, apostrophes
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

const NAME_REGEX = /^[\p{L} '\-]+$/u;
const MAX_LEN = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req.headers.get("Authorization"), req);

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.display_name === "string" ? body.display_name : "";
    const trimmed = raw.trim();

    let nextValue: string | null;
    if (trimmed.length === 0) {
      nextValue = null; // clear override → fall back to auth_name / full_name
    } else {
      if (trimmed.length > MAX_LEN) {
        return new Response(
          JSON.stringify({ error: `Name must be ${MAX_LEN} characters or fewer` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!NAME_REGEX.test(trimmed)) {
        return new Response(
          JSON.stringify({ error: "Name can only contain letters, spaces, hyphens and apostrophes" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      nextValue = trimmed;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: nextValue, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, display_name, auth_name, full_name")
      .maybeSingle();

    if (error) {
      console.error("[update-display-name] update failed:", error.message);
      return new Response(
        JSON.stringify({ error: "Failed to update display name" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveName = data.display_name || data.auth_name || data.full_name || null;

    return new Response(
      JSON.stringify({ success: true, profile: data, effective_name: effectiveName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = (err as Error)?.message || "Unauthorized";
    console.error("[update-display-name] error:", msg);
    const status = msg.toLowerCase().includes("auth") ? 401 : 500;
    return new Response(
      JSON.stringify({ error: msg }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
