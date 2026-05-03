import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-user-id",
};

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId!;

    const body = await req.json().catch(() => ({}));
    const {
      practiceId,
      practiceType = "mindset",
      sessionId,
      tempSessionKey,
      stepNumber,
      stepTitle,
      prompt,
      response,
      entryContext,
      localDate,
    } = body || {};

    if (typeof practiceId !== "string" || !practiceId.trim()) {
      return new Response(JSON.stringify({ error: "practiceId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 50) {
      return new Response(JSON.stringify({ error: "invalid stepNumber" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isYmd(localDate)) {
      return new Response(JSON.stringify({ error: "invalid localDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmed = typeof response === "string" ? response.trim().slice(0, 2000) : "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // If we have a real sessionId AND a tempSessionKey, re-link any earlier
    // drafts (saved before completion returned a session_id) to the session.
    if (sessionId && tempSessionKey) {
      const { error: linkErr } = await supabase
        .from("practice_reflections")
        .update({ session_id: sessionId })
        .eq("user_id", userId)
        .eq("practice_id", practiceId)
        .eq("temp_session_key", tempSessionKey)
        .is("session_id", null);
      if (linkErr) console.error("[save-practice-reflection] relink error", linkErr);
    }

    // Empty response → delete any existing row for this slot
    if (!trimmed) {
      const q = supabase
        .from("practice_reflections")
        .delete()
        .eq("user_id", userId)
        .eq("practice_id", practiceId)
        .eq("step_number", stepNumber);
      if (sessionId) q.eq("session_id", sessionId);
      else if (tempSessionKey) q.eq("temp_session_key", tempSessionKey);
      const { error } = await q;
      if (error) console.error("[save-practice-reflection] delete error", error);
      return new Response(JSON.stringify({ success: true, deleted: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = {
      user_id: userId,
      practice_id: practiceId,
      practice_type: practiceType || "mindset",
      session_id: sessionId || null,
      temp_session_key: sessionId ? null : (tempSessionKey || null),
      step_number: stepNumber,
      step_title: typeof stepTitle === "string" ? stepTitle.slice(0, 200) : null,
      prompt: typeof prompt === "string" ? prompt.slice(0, 1000) : null,
      response: trimmed,
      entry_context: typeof entryContext === "string" ? entryContext.slice(0, 50) : null,
      local_date: localDate,
      updated_at: new Date().toISOString(),
    };

    // Manual upsert by (user_id, practice_id, session_id|temp_session_key, step_number)
    let existingId: string | null = null;
    {
      const q = supabase
        .from("practice_reflections")
        .select("id")
        .eq("user_id", userId)
        .eq("practice_id", practiceId)
        .eq("step_number", stepNumber)
        .limit(1);
      if (sessionId) q.eq("session_id", sessionId);
      else if (tempSessionKey) q.eq("temp_session_key", tempSessionKey).is("session_id", null);
      else q.is("session_id", null).is("temp_session_key", null);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== "PGRST116") {
        console.error("[save-practice-reflection] lookup error", error);
      }
      existingId = data?.id ?? null;
    }

    if (existingId) {
      const { data, error } = await supabase
        .from("practice_reflections")
        .update(row)
        .eq("id", existingId)
        .select("id, updated_at")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("practice_reflections")
      .insert(row)
      .select("id, updated_at")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[save-practice-reflection] error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});