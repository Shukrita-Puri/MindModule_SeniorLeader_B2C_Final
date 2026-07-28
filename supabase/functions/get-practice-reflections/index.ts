import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-mm-client-platform",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId!;

    const url = new URL(req.url);
    const practiceId = url.searchParams.get("practiceId");
    const sessionId = url.searchParams.get("sessionId");
    const tempSessionKey = url.searchParams.get("tempSessionKey");
    const localDate = url.searchParams.get("localDate");

    if (!practiceId) {
      return new Response(JSON.stringify({ error: "practiceId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = supabase
      .from("practice_reflections")
      .select("id, step_number, step_title, prompt, response, session_id, temp_session_key, local_date, updated_at")
      .eq("user_id", userId)
      .eq("practice_id", practiceId)
      .order("step_number", { ascending: true });

    if (sessionId) q = q.eq("session_id", sessionId);
    else if (tempSessionKey) q = q.eq("temp_session_key", tempSessionKey);
    else if (localDate) q = q.eq("local_date", localDate);
    else {
      // default: today (UTC) — caller should send localDate ideally
      const today = new Date().toISOString().split("T")[0];
      q = q.eq("local_date", today);
    }

    const { data, error } = await q;
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data: data ?? [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-practice-reflections] error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});