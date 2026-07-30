/**
 * Oura sync fan-out.
 *
 * Called by pg_cron each hour. Iterates every active oura_connections row and
 * fires sync-oura with the service-role admin bypass. Failures of individual
 * users do not block others.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*, x-mm-client-platform",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  // Only pg_cron (via CRON_SHARED_SECRET from vault) or a service-role caller
  // may fan out Oura syncs. The public anon key is explicitly rejected — it is
  // a client-facing credential and previously allowed anyone to trigger a
  // fleet-wide sync.
  const cronSharedSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
  const adminBypass = req.headers.get("x-admin-bypass") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRoleCaller =
    (authHeader.startsWith("Bearer ") && authHeader.slice(7) === serviceKey) ||
    adminBypass === serviceKey;
  const isCronCaller =
    cronSharedSecret.length > 0 &&
    cronSecretHeader.length > 0 &&
    cronSecretHeader === cronSharedSecret;
  if (!isServiceRoleCaller && !isCronCaller) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createClient(projectUrl, serviceKey);
  const { data: rows, error } = await db
    .from("oura_connections")
    .select("user_id")
    .or("is_active.eq.true,connection_status.eq.connected")
    .neq("connection_status", "permission_revoked");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[oura-sync-fanout] dispatching to ${rows?.length ?? 0} active users`);
  const results: Array<{ user_id: string; ok: boolean; status?: number; error?: string }> = [];
  await Promise.all((rows ?? []).map(async (r) => {
    try {
      const res = await fetch(`${projectUrl}/functions/v1/sync-oura`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-bypass": serviceKey,
        },
        body: JSON.stringify({ user_id: r.user_id, source: "cron_fanout" }),
      });
      results.push({ user_id: r.user_id, ok: res.ok, status: res.status });
    } catch (e) {
      results.push({ user_id: r.user_id, ok: false, error: (e as Error)?.message });
    }
  }));

  const succeeded = results.filter((r) => r.ok).length;
  console.log(`[oura-sync-fanout] complete: ${succeeded}/${results.length} succeeded`);
  return new Response(JSON.stringify({ total: results.length, succeeded, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
