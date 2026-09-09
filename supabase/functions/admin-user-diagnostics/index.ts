import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function maskToken(tok: string | null | undefined): string | null {
  if (!tok) return null;
  if (tok.length <= 12) return "***";
  return `${tok.substring(0, 12)}...`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim();
  if (!userId) {
    return json({ error: "Missing userId query parameter" }, 400);
  }

  const [integrationsRes, tokensRes] = await Promise.all([
    db
      .from("user_integrations")
      .select(
        "watch_connection_status, watch_sync_status, watch_last_sync_at, watch_last_sample_at, watch_last_error",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("notification_device_tokens")
      .select("id, platform, is_active, updated_at, device_token")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);

  if (integrationsRes.error) {
    console.error(
      "[admin-user-diagnostics] user_integrations query failed:",
      integrationsRes.error,
    );
    return json({ error: "Failed to read HealthKit integration data" }, 500);
  }

  if (tokensRes.error) {
    console.error(
      "[admin-user-diagnostics] notification_device_tokens query failed:",
      tokensRes.error,
    );
    return json({ error: "Failed to read push notification token data" }, 500);
  }

  const tokens = (tokensRes.data ?? []).map((row: any) => ({
    id: row.id,
    platform: row.platform,
    isActive: row.is_active,
    updatedAt: row.updated_at,
    deviceTokenMasked: maskToken(row.device_token),
  }));

  return json({
    userId,
    healthkit: integrationsRes.data,
    tokens,
  });
});
