import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    console.log("[check-connections-status] Authenticated userId:", userId);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check calendar connection
    const { data: calendarConn, error: calError } = await db
      .from("calendar_connections")
      .select("id, provider, is_active, last_sync")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    console.log("[check-connections-status] Calendar query result:", JSON.stringify({ calendarConn, calError }));

    // Check Oura connection
    const { data: ouraConn } = await db
      .from("oura_connections")
      .select("id, is_active, last_sync")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Check Apple Watch — look for recent wearable data (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: latestWearable } = await db
      .from("wearable_data")
      .select("id, updated_at")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = {
      calendar: {
        connected: !!calendarConn,
        provider: calendarConn?.provider || null,
        lastSync: calendarConn?.last_sync || null,
      },
      oura: {
        connected: !!ouraConn,
        lastSync: ouraConn?.last_sync || null,
      },
      appleWatch: {
        connected: !!latestWearable,
        lastSync: latestWearable?.updated_at || null,
      },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[check-connections-status] Error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to check connections" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
