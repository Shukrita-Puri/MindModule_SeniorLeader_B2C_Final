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

      // Verify session belongs to user and fetch metadata for behavior log
      const { data: existingSession, error: fetchError } = await supabase
        .from("dialogue_sessions")
        .select("user_id, context_type, coach_personality, meta_data")
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

      // Await behavior_log insert to prevent silent data loss
      try {
        const { error: blErr } = await supabase.from('behavior_logs').insert({
          user_id: userId,
          behavior_type: 'coach_session',
          event_title: 'coach',
          energy_after: null,
          context_event_id: sessionId,
          created_at: new Date().toISOString(),
        });
        if (blErr) console.error('[dialogue-session-manage] behavior_log insert error:', blErr);
        else console.log('[dialogue-session-manage] behavior_log inserted for session:', sessionId);
      } catch (blCatchErr) {
        console.error('[dialogue-session-manage] behavior_log insert exception:', blCatchErr);
      }

      // Fire downstream processing functions server-side if enough messages
      const msgCount = totalMessages || 0;
      if (msgCount >= 2 && existingSession.context_type === 'coach') {
        // Check if summary already exists (avoid duplicate processing)
        const { data: existingSummary } = await supabase
          .from('coach_session_summaries')
          .select('id')
          .eq('session_id', sessionId)
          .maybeSingle();

        if (!existingSummary) {
          const payload = JSON.stringify({ sessionId, userId });
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          };

          const downstreamFns = [
            'extract-coach-insights',
            'analyze-probing-effectiveness',
            'generate-coach-summary',
            'detect-recurring-patterns',
            'detect-coach-scenarios',
            'extract-tool-commitments',
            'resolve-session-commitments',
          ];

          // Fire all downstream in parallel (fire-and-forget)
          Promise.allSettled(
            downstreamFns.map(fn =>
              fetch(`${supabaseUrl}/functions/v1/${fn}`, {
                method: 'POST',
                headers,
                body: payload,
              }).then(async (res) => {
                if (!res.ok) {
                  const body = await res.text();
                  console.error(`[dialogue-session-manage] ${fn} failed (${res.status}):`, body);
                }
                return { fn, status: res.status };
              })
            )
          ).then(results => {
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            console.log(`[dialogue-session-manage] Session ${sessionId}: ${succeeded}/${downstreamFns.length} downstream succeeded`);
          });

          // Fire extract-session-memories after delay to let summary complete
          setTimeout(async () => {
            try {
              await fetch(`${supabaseUrl}/functions/v1/extract-session-memories`, {
                method: 'POST',
                headers,
                body: payload,
              });
            } catch (e) {
              console.error(`[dialogue-session-manage] extract-session-memories failed:`, e);
            }
          }, 5000);
        } else {
          console.log(`[dialogue-session-manage] Session ${sessionId} already has summary — skipping downstream`);
        }

        // ── TINY WIN EXTRACTION (reliable, at session close) ──
        // Check if tiny_wins already exist for this session (dedupe guard)
        const { data: existingWins } = await supabase
          .from('tiny_wins')
          .select('id')
          .eq('session_id', sessionId)
          .limit(1);

        if (!existingWins || existingWins.length === 0) {
          try {
            // Fetch all session messages
            const { data: sessionMessages } = await supabase
              .from('dialogue_messages')
              .select('content, sender_type')
              .eq('session_id', sessionId)
              .order('message_index', { ascending: true });

            if (sessionMessages && sessionMessages.length >= 2) {
              const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
              if (LOVABLE_API_KEY) {
                // Filter to user-only messages — wins must come from user's own statements
                const aiMessages = sessionMessages
                  .filter(m => m.sender_type === 'user')
                  .map(m => ({ role: 'user' as const, content: m.content }));

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);

                const winResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                      {
                        role: 'system',
                         content: `You are given ONLY user messages from a coaching conversation. Every message is something the user said — no coach responses are included.

Extract genuine tiny wins — actions they took, achievements, growth moments, or things they are proud of.

A win MUST contain an ACTION VERB — the user must describe something they DID, ACHIEVED, CHOSE, REALIZED, or COMPLETED.

DO NOT treat the following as wins:
- Generic greetings or small talk
- Questions the user asks without describing an action
- Complaints, venting, or purely negative statements about current state (e.g., "feeling overwhelmed", "stressed out", "struggling with", "things are tough")
- Status descriptions without an action verb (e.g., "workload is heavy", "things are busy", "lots going on")
- Descriptions of problems or challenges without a response to them

DO treat these as wins:
- Specific actions the user took (e.g., "I stayed calm during the board meeting")
- Behaviors they're proud of (e.g., "I delegated instead of doing it myself")
- Realizations or growth moments (e.g., "I noticed I was getting reactive and paused")
- Reflections on what went well (e.g., "things actually went smoothly today")
- Moments of self-awareness
- Choosing differently than usual
- Completing or delivering something (e.g., "launched the beta", "shipped the project")
- Progress on a pattern they've been working on

If the user shared a genuine win across multiple messages, consolidate it into one clear statement.
If no genuine win is present, do NOT force one — it's better to miss than to capture a complaint as a win.`
                      },
                      ...aiMessages,
                    ],
                    tools: [{
                      type: 'function',
                      function: {
                        name: 'store_tiny_win',
                        description: 'Store a tiny win when the user shares a genuine personal achievement or positive reflection.',
                        parameters: {
                          type: 'object',
                          properties: {
                            win_content: {
                              type: 'string',
                              description: 'The actual win or achievement the user described.',
                            },
                          },
                          required: ['win_content'],
                        },
                      },
                    }],
                    tool_choice: { type: 'function', function: { name: 'store_tiny_win' } },
                    stream: false,
                  }),
                  signal: controller.signal,
                });

                clearTimeout(timeout);

                if (winResponse.ok) {
                  const winData = await winResponse.json();
                  const toolCalls = winData.choices?.[0]?.message?.tool_calls;
                  if (toolCalls) {
                    for (const tc of toolCalls) {
                      if (tc.function?.name === 'store_tiny_win') {
                        try {
                          const args = JSON.parse(tc.function.arguments);
                          const winContent = args.win_content?.trim();
                          // Quality gate: reject non-wins
                          const NON_WIN_PATTERNS = /^(feeling\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck)|struggling\s+with|things\s+are\s+(tough|hard|busy|heavy)|workload\s+is|lots?\s+going\s+on|i('m|\s+am)\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck))/i;
                          if (winContent && winContent.length >= 10 && !NON_WIN_PATTERNS.test(winContent)) {
                            await supabase.from('tiny_wins').insert({
                              user_id: userId,
                              session_id: sessionId,
                              win_content: winContent,
                              win_date: new Date().toISOString().split('T')[0],
                              source: 'coach',
                            });
                            console.log(`[dialogue-session-manage] ✅ Tiny win extracted: ${winContent.substring(0, 60)}`);
                          }
                        } catch (parseErr) {
                          console.error('[dialogue-session-manage] Win parse error:', parseErr);
                        }
                      }
                    }
                  }
                } else {
                  console.warn(`[dialogue-session-manage] Win extraction AI returned ${winResponse.status}`);
                }
              }
            }
          } catch (winErr) {
            console.error(`[dialogue-session-manage] Tiny win extraction error:`, winErr);
          }
        } else {
          console.log(`[dialogue-session-manage] Session ${sessionId} already has tiny_wins — skipping extraction`);
        }
      }

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

    } else if (action === "LIST_COACH_SESSIONS") {
      const { limit = 5 } = body;

      console.log("[dialogue-session-manage] LIST_COACH_SESSIONS for user:", userId, "limit:", limit);

      // Get recent coach sessions
      const { data: sessions, error: listError } = await supabase
        .from("dialogue_sessions")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("context_type", "coach")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (listError) {
        console.error("[dialogue-session-manage] LIST_COACH_SESSIONS failed:", listError);
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get first user message for each session to use as title
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

      console.log("[dialogue-session-manage] LIST_COACH_SESSIONS result:", sessionsWithTitle.length, "sessions");

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
