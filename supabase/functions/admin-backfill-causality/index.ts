// Temporary admin backfill: forces cause-effect-engine v4 recompute for the
// active users so `signal_summary.performance_lift` populates. No auth; safe
// because it only loops a hardcoded user list and only triggers the engine
// (which writes to its own row via service role). DELETE after use.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TARGETS = [
  "google-oauth2|111878424918915566691",
  "linkedin|9JQfhVmok6",
  "linkedin|DFUJTWpo4O",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const results: Array<{ user_id: string; status: number; body: string }> = [];
  for (const userId of TARGETS) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cause-effect-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": SUPABASE_SERVICE_ROLE_KEY,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ target_user_id: userId, force: true }),
      });
      const txt = (await res.text()).slice(0, 200);
      results.push({ user_id: userId, status: res.status, body: txt });
    } catch (e: any) {
      results.push({ user_id: userId, status: 0, body: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), { headers: corsHeaders });
});