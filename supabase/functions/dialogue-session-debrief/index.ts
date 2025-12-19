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
    console.log("[dialogue-session-debrief] Verified user:", userId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "sessionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session and verify ownership
    const { data: session, error: sessionError } = await supabase
      .from("dialogue_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.user_id !== userId) {
      console.warn("[dialogue-session-debrief] User attempted to view another user's session");
      return new Response(
        JSON.stringify({ error: "Forbidden - not your session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all related data in parallel
    const [messagesResult, interventionsResult, signalsResult] = await Promise.all([
      supabase
        .from("dialogue_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("message_index", { ascending: true }),
      supabase
        .from("dialogue_interventions")
        .select("*")
        .eq("session_id", sessionId)
        .order("displayed_at", { ascending: true }),
      supabase
        .from("detected_signals")
        .select("*")
        .eq("session_id", sessionId),
    ]);

    if (messagesResult.error) {
      console.error("[dialogue-session-debrief] Messages fetch failed:", messagesResult.error);
    }
    if (interventionsResult.error) {
      console.error("[dialogue-session-debrief] Interventions fetch failed:", interventionsResult.error);
    }
    if (signalsResult.error) {
      console.error("[dialogue-session-debrief] Signals fetch failed:", signalsResult.error);
    }

    console.log("[dialogue-session-debrief] Data fetched for session:", sessionId, {
      messages: messagesResult.data?.length || 0,
      interventions: interventionsResult.data?.length || 0,
      signals: signalsResult.data?.length || 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        session,
        messages: messagesResult.data || [],
        interventions: interventionsResult.data || [],
        signals: signalsResult.data || [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[dialogue-session-debrief] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
