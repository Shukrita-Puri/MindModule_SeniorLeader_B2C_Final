import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-mm-client-platform",
};

type EngagementAction = "tap" | "action_completed" | "dismissed";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if ("errorResponse" in auth) return auth.errorResponse;

    const body = await req.json().catch(() => ({}));
    const notificationLogId = String(body?.notification_log_id || "").trim();
    const action = String(body?.action || "").trim() as EngagementAction;
    const occurredAt = body?.occurred_at ? new Date(body.occurred_at) : new Date();

    if (!notificationLogId) {
      return new Response(JSON.stringify({ error: "notification_log_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["tap", "action_completed", "dismissed"].includes(action)) {
      return new Response(JSON.stringify({ error: "invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: row, error: rowErr } = await supabase
      .from("notification_log")
      .select("id, user_id, sent_at, delivery_state")
      .eq("id", notificationLogId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (rowErr) throw rowErr;
    if (!row) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = {};
    if (action === "tap") {
      update.tapped = true;
      update.app_opened = true;
      update.time_to_engagement_seconds = row.sent_at
        ? Math.max(0, Math.round((Date.now() - new Date(row.sent_at).getTime()) / 1000))
        : null;
      if (row.delivery_state !== "failed" && row.delivery_state !== "expired_before_delivery") {
        update.delivery_state = "delivered";
        update.delivered_at = occurredAt.toISOString();
      }
    } else if (action === "action_completed") {
      update.target_action_completed = true;
    } else {
      update.dismissed = true;
    }

    const { error: updateErr } = await supabase
      .from("notification_log")
      .update(update)
      .eq("id", notificationLogId)
      .eq("user_id", auth.userId);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
