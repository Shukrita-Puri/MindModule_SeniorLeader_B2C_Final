import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0JWT(authHeader);

    const body = await req.json();
    const { action } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "GET") {
      const { data, error } = await supabaseAdmin
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "UPSERT_STEP") {
      const { step, metadata } = body;

      const stepColumn = `${step.replace(/-/g, "_")}_at`;
      const validColumns = [
        "welcome_at", "identity_at", "emotional_awareness_at",
        "stress_response_at", "recovery_patterns_at", "mental_clarity_at",
        "growth_intention_at", "signup_step_at", "results_at",
        "payment_at", "context_connection_at",
      ];

      if (!validColumns.includes(stepColumn)) {
        return new Response(
          JSON.stringify({ success: false, error: `Invalid step: ${step}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date().toISOString();

      // Check if row exists
      const { data: existing } = await supabaseAdmin
        .from("onboarding_progress")
        .select("id, " + stepColumn)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        // Insert new row
        const insertData: Record<string, unknown> = {
          user_id: userId,
          current_step: step,
          [stepColumn]: now,
          started_at: now,
        };
        if (metadata?.selected_plan) insertData.selected_plan = metadata.selected_plan;
        if (metadata?.context_calendar_enabled !== undefined) insertData.context_calendar_enabled = metadata.context_calendar_enabled;
        if (metadata?.context_watch_enabled !== undefined) insertData.context_watch_enabled = metadata.context_watch_enabled;
        if (step === "context_connection" || metadata?.completed) insertData.completed_at = now;

        const { error: insertErr } = await supabaseAdmin
          .from("onboarding_progress")
          .insert(insertData);

        if (insertErr) throw insertErr;
      } else {
        // Update — only set timestamp if not already set (idempotent)
        const updateData: Record<string, unknown> = { current_step: step };
        if (!(existing as any)[stepColumn]) {
          updateData[stepColumn] = now;
        }
        if (metadata?.selected_plan) updateData.selected_plan = metadata.selected_plan;
        if (metadata?.context_calendar_enabled !== undefined) updateData.context_calendar_enabled = metadata.context_calendar_enabled;
        if (metadata?.context_watch_enabled !== undefined) updateData.context_watch_enabled = metadata.context_watch_enabled;
        if (step === "context_connection" || metadata?.completed) updateData.completed_at = now;

        const { error: updateErr } = await supabaseAdmin
          .from("onboarding_progress")
          .update(updateData)
          .eq("user_id", userId);

        if (updateErr) throw updateErr;
      }

      console.log(`[onboarding-progress] ✅ Step '${step}' recorded for user:`, userId);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[onboarding-progress] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
