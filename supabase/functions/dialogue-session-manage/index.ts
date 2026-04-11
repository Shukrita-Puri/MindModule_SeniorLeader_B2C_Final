import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { callClaudeText, callClaudeWithTools, CLAUDE_MODELS } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    console.log("[dialogue-session-manage] Verified user:", userId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // ────────────────────────────────────────────────────────────
    //  CREATE (scenario-based dialogue session)
    // ────────────────────────────────────────────────────────────
    if (action === "create") {
      const { scenarioId, personaId, coachPersonality, metaData } = body;

      console.log("[dialogue-session-manage] Creating session for user:", userId);

      const [scenarioRes, personaRes] = await Promise.all([
        supabase.from("scenario_definitions").select("*").eq("id", scenarioId).single(),
        supabase.from("persona_definitions").select("*").eq("id", personaId).single(),
      ]);

      if (scenarioRes.error || !scenarioRes.data) {
        return new Response(
          JSON.stringify({ error: `Scenario not found: ${scenarioId}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (personaRes.error || !personaRes.data) {
        return new Response(
          JSON.stringify({ error: `Persona not found: ${personaId}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scenario = scenarioRes.data;
      const persona = personaRes.data;

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

      return new Response(
        JSON.stringify({ success: true, session, scenario, persona }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // ────────────────────────────────────────────────────────────
    //  END (legacy) — redirects to finalize_coach for coach sessions
    // ────────────────────────────────────────────────────────────
    } else if (action === "end") {
      const { sessionId, totalMessages } = body;

      // Fetch session to check type + status
      const { data: session, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("user_id, context_type, session_status")
        .eq("id", sessionId)
        .single();

      if (fetchError || !session) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: "Forbidden - not your session" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For coach sessions, delegate to the idempotent finalize path
      if (session.context_type === "coach") {
        return await finalizeCoachSession(supabase, supabaseUrl, supabaseServiceKey, sessionId, userId);
      }

      // Non-coach sessions: simple status update
      if (session.session_status === "completed") {
        return new Response(
          JSON.stringify({ success: true, alreadyCompleted: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("dialogue_sessions")
        .update({
          session_status: "completed",
          ended_at: new Date().toISOString(),
          total_messages: totalMessages,
        })
        .eq("id", sessionId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to end session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // ────────────────────────────────────────────────────────────
    //  FINALIZE_COACH — idempotent finalization for coach sessions
    //  Safe to call from: explicit End Session, pagehide beacon,
    //  unmount cleanup, or orphaned-session cron.
    // ────────────────────────────────────────────────────────────
    } else if (action === "finalize_coach") {
      const { sessionId } = body;
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "sessionId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify ownership
      const { data: session, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("user_id, context_type, session_status")
        .eq("id", sessionId)
        .single();

      if (fetchError || !session) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return await finalizeCoachSession(supabase, supabaseUrl, supabaseServiceKey, sessionId, userId);

    // ────────────────────────────────────────────────────────────
    //  GET_LATEST
    // ────────────────────────────────────────────────────────────
    } else if (action === "GET_LATEST") {
      const { data, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, sessionId: data?.id ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // ────────────────────────────────────────────────────────────
    //  CREATE_COACH
    // ────────────────────────────────────────────────────────────
    } else if (action === "create_coach") {
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

    // ────────────────────────────────────────────────────────────
    //  LIST_COACH_SESSIONS
    // ────────────────────────────────────────────────────────────
    } else if (action === "LIST_COACH_SESSIONS") {
      const { limit = 5 } = body;

      const { data: sessions, error: listError } = await supabase
        .from("dialogue_sessions")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("context_type", "coach")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (listError) {
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sessionsWithTitle = await Promise.all(
        (sessions || []).map(async (session) => {
          const { data: firstMessage } = await supabase
            .from("dialogue_messages")
            .select("content")
            .eq("session_id", session.id)
            .eq("sender_type", "user")
            .order("message_index", { ascending: true })
            .limit(1)
            .single();

          return {
            id: session.id,
            started_at: session.started_at,
            title: firstMessage?.content?.slice(0, 50) || "Coach conversation"
          };
        })
      );

      return new Response(
        JSON.stringify({ success: true, sessions: sessionsWithTitle }),
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


// ──────────────────────────────────────────────────────────────────
//  Idempotent coach session finalizer
//  Handles: status update, behavior log, downstream processing,
//  tiny win extraction. All with dedupe guards.
// ──────────────────────────────────────────────────────────────────
async function finalizeCoachSession(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  sessionId: string,
  userId: string,
): Promise<Response> {
  // 1. Fetch current session state
  const { data: session, error: fetchErr } = await supabase
    .from("dialogue_sessions")
    .select("session_status, ended_at, context_type")
    .eq("id", sessionId)
    .single();

  if (fetchErr || !session) {
    return new Response(
      JSON.stringify({ error: "Session not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Already completed – idempotent return
  if (session.session_status === "completed") {
    console.log(`[finalize_coach] Session ${sessionId} already completed – noop`);
    return new Response(
      JSON.stringify({ success: true, alreadyCompleted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Count actual messages
  const { count: msgCount } = await supabase
    .from("dialogue_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  const totalMessages = msgCount || 0;

  // 3. Mark session completed
  const { error: updateErr } = await supabase
    .from("dialogue_sessions")
    .update({
      session_status: "completed",
      ended_at: new Date().toISOString(),
      total_messages: totalMessages,
    })
    .eq("id", sessionId)
    .eq("session_status", "active"); // Only update if still active (atomic guard)

  if (updateErr) {
    console.error(`[finalize_coach] Update error:`, updateErr);
  }

  console.log(`[finalize_coach] Session ${sessionId} completed with ${totalMessages} messages`);

  // 4. Insert behavior log (dedupe: check if one already exists for this session)
  const { data: existingBL } = await supabase
    .from("behavior_logs")
    .select("id")
    .eq("context_event_id", sessionId)
    .eq("behavior_type", "coach_session")
    .limit(1);

  if (!existingBL || existingBL.length === 0) {
    const { error: blErr } = await supabase.from("behavior_logs").insert({
      user_id: userId,
      behavior_type: "coach_session",
      event_title: "coach",
      energy_after: null,
      context_event_id: sessionId,
      created_at: new Date().toISOString(),
    });
    if (blErr) console.error("[finalize_coach] behavior_log error:", blErr);
  }

  // 5. Skip downstream processing for trivial sessions (<2 messages)
  if (totalMessages < 2) {
    console.log(`[finalize_coach] Session ${sessionId}: only ${totalMessages} msgs – skipping downstream`);
    return new Response(
      JSON.stringify({ success: true, downstream: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 6. Check if downstream already ran (summary exists = already processed)
  const { data: existingSummary } = await supabase
    .from("coach_session_summaries")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingSummary) {
    console.log(`[finalize_coach] Session ${sessionId} already has summary – skipping downstream`);
    return new Response(
      JSON.stringify({ success: true, downstream: false, alreadyProcessed: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 7. Fire all downstream functions (server-to-server, fire-and-forget)
  const payload = JSON.stringify({ sessionId, userId });
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${supabaseServiceKey}`,
  };

  const downstreamFns = [
    "extract-coach-insights",
    "analyze-probing-effectiveness",
    "generate-coach-summary",
    "detect-recurring-patterns",
    "detect-coach-scenarios",
    "extract-tool-commitments",
    "resolve-session-commitments",
  ];

  Promise.allSettled(
    downstreamFns.map((fn) =>
      fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers,
        body: payload,
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          console.error(`[finalize_coach] ${fn} failed (${res.status}):`, body);
        }
        return { fn, status: res.status };
      })
    )
  ).then((results) => {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(`[finalize_coach] ${sessionId}: ${succeeded}/${downstreamFns.length} downstream succeeded`);
  });

  // 8. Extract session memories after delay (depends on summary)
  setTimeout(async () => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/extract-session-memories`, {
        method: "POST",
        headers,
        body: payload,
      });
    } catch (e) {
      console.error(`[finalize_coach] extract-session-memories failed:`, e);
    }
  }, 5000);

  // 9. Tiny win extraction (dedupe guard)
  const { data: existingWins } = await supabase
    .from("tiny_wins")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1);

  if (!existingWins || existingWins.length === 0) {
    try {
      const { data: sessionMessages } = await supabase
        .from("dialogue_messages")
        .select("content, sender_type")
        .eq("session_id", sessionId)
        .order("message_index", { ascending: true });

      if (sessionMessages && sessionMessages.length >= 2) {
        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        if (ANTHROPIC_API_KEY) {
          const aiMessages = sessionMessages
            .filter((m: { sender_type: string }) => m.sender_type === "user")
            .map((m: { content: string }) => ({ role: "user" as const, content: m.content }));

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const winResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              messages: [
                {
                  role: "system",
                  content: `You are given ONLY user messages from a coaching conversation. Every message is something the user said – no coach responses are included.

Extract genuine tiny wins – actions they took, achievements, growth moments, or things they are proud of.

A win MUST contain an ACTION VERB – the user must describe something they DID, ACHIEVED, CHOSE, REALIZED, or COMPLETED.

DO NOT treat the following as wins:
- Generic greetings or small talk
- Questions the user asks without describing an action
- Complaints, venting, or purely negative statements about current state
- Status descriptions without an action verb

DO treat these as wins:
- Specific actions the user took
- Behaviors they're proud of
- Realizations or growth moments
- Reflections on what went well
- Moments of self-awareness
- Choosing differently than usual
- Completing or delivering something
- Progress on a pattern they've been working on

If no genuine win is present, do NOT force one – it's better to miss than to capture a complaint as a win.`,
                },
                ...aiMessages,
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "store_tiny_win",
                    description: "Store a tiny win when the user shares a genuine personal achievement.",
                    parameters: {
                      type: "object",
                      properties: {
                        win_content: {
                          type: "string",
                          description: "The actual win or achievement the user described.",
                        },
                      },
                      required: ["win_content"],
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "store_tiny_win" } },
              stream: false,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (winResponse.ok) {
            const winData = await winResponse.json();
            const toolCalls = winData.content?.filter((c: any) => c.type === 'tool_use');
            if (toolCalls) {
              const NON_WIN_PATTERNS =
                /^(feeling\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck)|struggling\s+with|things\s+are\s+(tough|hard|busy|heavy)|workload\s+is|lots?\s+going\s+on|i('m|\s+am)\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck))/i;

              for (const tc of toolCalls) {
                if (tc.function?.name === "store_tiny_win") {
                  try {
                    const args = JSON.parse(tc.function.arguments);
                    const winContent = args.win_content?.trim();
                    if (winContent && winContent.length >= 10 && !NON_WIN_PATTERNS.test(winContent)) {
                      await supabase.from("tiny_wins").insert({
                        user_id: userId,
                        session_id: sessionId,
                        win_content: winContent,
                        win_date: new Date().toISOString().split("T")[0],
                        source: "coach",
                      });
                      console.log(`[finalize_coach] ✅ Tiny win: ${winContent.substring(0, 60)}`);
                    }
                  } catch (parseErr) {
                    console.error("[finalize_coach] Win parse error:", parseErr);
                  }
                }
              }
            }
          }
        }
      }
    } catch (winErr) {
      console.error(`[finalize_coach] Tiny win extraction error:`, winErr);
    }
  }

  return new Response(
    JSON.stringify({ success: true, downstream: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}