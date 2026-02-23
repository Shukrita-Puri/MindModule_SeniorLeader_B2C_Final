import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Auth0 token
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;
    console.log("[dialogue-progress-data] Verified user:", userId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch dialogue sessions with scenario data (only for this user)
    const { data: dialogueSessions, error: sessionsError } = await supabase
      .from("dialogue_sessions")
      .select(`
        id,
        scenario_id,
        scenario_definitions (
          category
        )
      `)
      .eq("user_id", userId)
      .eq("session_status", "completed");

    if (sessionsError) {
      console.error("[dialogue-progress-data] Sessions fetch failed:", sessionsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch sessions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get session IDs for signal lookup
    const sessionIds = dialogueSessions?.map(s => s.id) || [];
    
    let signals: any[] = [];
    if (sessionIds.length > 0) {
      const { data: signalsData, error: signalsError } = await supabase
        .from("detected_signals")
        .select("skill_strengths, skill_gaps, session_id")
        .in("session_id", sessionIds);

      if (signalsError) {
        console.error("[dialogue-progress-data] Signals fetch failed:", signalsError);
        // Don't fail - just return empty signals
      } else {
        signals = signalsData || [];
      }
    }

    console.log("[dialogue-progress-data] Data fetched:", {
      sessions: dialogueSessions?.length || 0,
      signals: signals.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        dialogueSessions: dialogueSessions || [],
        signals,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[dialogue-progress-data] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
