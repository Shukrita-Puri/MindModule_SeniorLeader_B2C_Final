import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Verify Auth0 token via /userinfo endpoint
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  
  const token = authHeader.replace("Bearer ", "");
  const auth0Domain = Deno.env.get("AUTH0_DOMAIN");
  
  if (!auth0Domain) {
    throw new Error("AUTH0_DOMAIN not configured");
  }
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Auth0 userinfo failed:", response.status, errorText);
    throw new Error("Invalid or expired token");
  }
  
  const userInfo = await response.json();
  if (!userInfo.sub) {
    throw new Error("Token verification failed - no sub claim");
  }
  
  return userInfo.sub;
}

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
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0Token(authHeader);
    console.log("[dialogue-session-manage] Verified user:", userId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { scenarioId, personaId, coachPersonality, metaData } = body;

      console.log("[dialogue-session-manage] Creating session for user:", userId);

      // Fetch scenario and persona details
      const [scenarioRes, personaRes] = await Promise.all([
        supabase.from("scenario_definitions").select("*").eq("id", scenarioId).single(),
        supabase.from("persona_definitions").select("*").eq("id", personaId).single(),
      ]);

      if (scenarioRes.error || !scenarioRes.data) {
        console.error("[dialogue-session-manage] Scenario not found:", scenarioRes.error);
        return new Response(
          JSON.stringify({ error: `Scenario not found: ${scenarioId}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (personaRes.error || !personaRes.data) {
        console.error("[dialogue-session-manage] Persona not found:", personaRes.error);
        return new Response(
          JSON.stringify({ error: `Persona not found: ${personaId}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scenario = scenarioRes.data;
      const persona = personaRes.data;

      // Create session
      const { data: session, error: sessionError } = await supabase
        .from("dialogue_sessions")
        .insert({
          user_id: userId,
          scenario_id: scenarioId,
          persona_id: personaId,
          context_type: scenario.context_type,
          scenario_context: scenario.scenario_context,
          coach_personality: coachPersonality || "supportive",
          session_status: "active",
          meta_data: metaData || {},
        })
        .select()
        .single();

      if (sessionError || !session) {
        console.error("[dialogue-session-manage] Session creation failed:", sessionError);
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-session-manage] Session created:", session.id);

      return new Response(
        JSON.stringify({
          success: true,
          session,
          scenario,
          persona,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "end") {
      const { sessionId, durationSeconds, totalMessages, totalInterventions } = body;

      // Verify session belongs to user
      const { data: existingSession, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("user_id")
        .eq("id", sessionId)
        .single();

      if (fetchError || !existingSession) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (existingSession.user_id !== userId) {
        console.warn("[dialogue-session-manage] User attempted to end another user's session");
        return new Response(
          JSON.stringify({ error: "Forbidden - not your session" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update session
      const { error: updateError } = await supabase
        .from("dialogue_sessions")
        .update({
          session_status: "completed",
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          total_messages: totalMessages,
          total_interventions: totalInterventions,
        })
        .eq("id", sessionId);

      if (updateError) {
        console.error("[dialogue-session-manage] Session update failed:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to end session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-session-manage] Session ended:", sessionId);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "GET_LATEST") {
      // Return the latest session id for the authenticated user
      const { data, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error("[dialogue-session-manage] GET_LATEST failed:", fetchError);
        return new Response(
          JSON.stringify({ error: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-session-manage] GET_LATEST result:", data?.id || "no sessions");

      return new Response(
        JSON.stringify({
          success: true,
          sessionId: data?.id ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "create_coach") {
      // Create a coach session for the authenticated user
      const { sessionId } = body;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "sessionId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-session-manage] Creating coach session:", sessionId, "for user:", userId);

      const { data: session, error: sessionError } = await supabase
        .from("dialogue_sessions")
        .insert({
          id: sessionId,
          user_id: userId,
          context_type: "coach",
          session_status: "active",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) {
        console.error("[dialogue-session-manage] Coach session creation failed:", sessionError);
        return new Response(
          JSON.stringify({ error: "Failed to create coach session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-session-manage] Coach session created:", session.id);

      return new Response(
        JSON.stringify({ success: true, session }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    console.error("[dialogue-session-manage] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
