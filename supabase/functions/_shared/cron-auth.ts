/**
 * Shared authorization for cron / batch edge functions.
 *
 * Accepts callers that present either:
 *   - the service-role key as a bearer token, or in x-admin-bypass, OR
 *   - the CRON_SHARED_SECRET (stored in Supabase vault, injected as env) in
 *     the x-cron-secret header.
 *
 * The public anon key is intentionally NOT accepted — these endpoints must
 * not be internet-reachable by arbitrary callers.
 */
export function isAuthorizedCronCaller(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSharedSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const adminBypass = req.headers.get("x-admin-bypass") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";

  const isServiceRoleCaller =
    serviceKey.length > 0 &&
    ((authHeader.startsWith("Bearer ") && authHeader.slice(7) === serviceKey) ||
      adminBypass === serviceKey);
  const isCronCaller =
    cronSharedSecret.length > 0 &&
    cronSecretHeader.length > 0 &&
    cronSecretHeader === cronSharedSecret;

  return isServiceRoleCaller || isCronCaller;
}

export function cronForbiddenResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}