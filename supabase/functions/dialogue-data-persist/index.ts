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
  const auth0Domain = Deno.env.get("VITE_AUTH0_DOMAIN");
  
  if (!auth0Domain) {
    throw new Error("VITE_AUTH0_DOMAIN not configured");
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

// Helper to verify session ownership
async function verifySessionOwnership(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("dialogue_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    console.error("[dialogue-data-persist] Session not found:", sessionId);
    return false;
  }

  return data.user_id === userId;
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
    console.log("[dialogue-data-persist] Verified user:", userId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { type, sessionId } = body;

    // Verify session ownership for all operations
    const isOwner = await verifySessionOwnership(supabase, sessionId, userId);
    if (!isOwner) {
      return new Response(
        JSON.stringify({ error: "Forbidden - not your session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "message") {
      const { message, signals } = body;

      // Insert message
      const { data: msgData, error: msgError } = await supabase
        .from("dialogue_messages")
        .insert({
          session_id: sessionId,
          message_index: message.messageIndex || 0,
          sender_type: message.role,
          content: message.content,
          emotion_displayed: message.emotion || null,
          timestamp: message.timestamp,
        })
        .select()
        .single();

      if (msgError) {
        console.error("[dialogue-data-persist] Message insert failed:", msgError);
        return new Response(
          JSON.stringify({ error: "Failed to persist message" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert signals if present
      if (signals && msgData) {
        const { error: signalError } = await supabase.from("detected_signals").insert({
          session_id: sessionId,
          message_id: msgData.id,
          sentiment: signals.sentiment || null,
          emotions: signals.emotions || null,
          ei_behaviors: signals.eiBehaviors || null,
          skill_gaps: signals.skillGaps || null,
          skill_strengths: signals.skillStrengths || null,
          conversation_flow: signals.conversationFlow || null,
          risk_assessment: signals.riskAssessment || null,
          coaching_readiness: signals.coachingReadiness || null,
          raw_signals: signals,
        });

        if (signalError) {
          console.error("[dialogue-data-persist] Signal insert failed:", signalError);
          // Don't fail the whole request for signal errors
        }
      }

      console.log("[dialogue-data-persist] Message persisted:", msgData?.id);

      return new Response(
        JSON.stringify({ success: true, messageId: msgData?.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (type === "intervention-create") {
      const { intervention } = body;

      const { data, error } = await supabase
        .from("dialogue_interventions")
        .insert({
          session_id: sessionId,
          intervention_type: "observation",
          meta_skill_target: intervention.metaSkill,
          sub_skill_target: intervention.subSkill,
          observation: intervention.observation,
          framework_used: intervention.framework,
          action_suggested: intervention.action,
          wisdom_source: intervention.wisdomQuote ? { quote: intervention.wisdomQuote } : null,
          displayed_at: intervention.displayedAt,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[dialogue-data-persist] Intervention insert failed:", error);
        return new Response(
          JSON.stringify({ error: "Failed to persist intervention" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-data-persist] Intervention created:", data?.id);

      return new Response(
        JSON.stringify({ success: true, interventionId: data?.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (type === "intervention-update") {
      const { interventionId, displayedAt, acknowledged } = body;

      const dismissedAt = new Date().toISOString();
      const displayTime = new Date(displayedAt).getTime();
      const dismissTime = new Date(dismissedAt).getTime();
      const viewDurationMs = dismissTime - displayTime;

      const { error } = await supabase
        .from("dialogue_interventions")
        .update({
          dismissed_at: dismissedAt,
          user_acknowledged: acknowledged || false,
          meta_data: {
            view_duration_ms: viewDurationMs,
            view_duration_seconds: Math.round(viewDurationMs / 1000),
          },
        })
        .eq("id", interventionId);

      if (error) {
        console.error("[dialogue-data-persist] Intervention update failed:", error);
        return new Response(
          JSON.stringify({ error: "Failed to update intervention" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[dialogue-data-persist] Intervention updated:", interventionId);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    console.error("[dialogue-data-persist] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
