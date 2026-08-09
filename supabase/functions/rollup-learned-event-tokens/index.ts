// Nightly token generalisation roll-up for the event-taxonomy learning loop.
// Promotes distinctive tokens to per-user learned cues once the same
// confirmed category recurs across ≥3 distinct titles. Cron-only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronForbiddenResponse, isAuthorizedCronCaller } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-admin-bypass",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorizedCronCaller(req)) return cronForbiddenResponse(corsHeaders);

  const body = await req.json().catch(() => ({}));
  const minTitles = Number.isFinite(body?.minTitles) ? Number(body.minTitles) : 3;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await supabase.rpc("promote_learned_event_tokens", {
    p_min_titles: minTitles,
  });

  if (error) {
    console.error("[rollup-learned-event-tokens] rpc failed", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[rollup-learned-event-tokens] done", JSON.stringify(data));
  return new Response(JSON.stringify({ ok: true, result: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});