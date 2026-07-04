import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";
import { signImpersonationToken } from "../_shared/impersonation.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  let body: { targetUserId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const targetUserId = (body.targetUserId ?? "").trim();
  if (!targetUserId) return json({ error: "targetUserId required" }, 400);

  // Refuse to impersonate another admin (defense in depth).
  const { data: target, error } = await db
    .from("profiles")
    .select("id, email, display_name, full_name")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!target) return json({ error: "Target user not found" }, 404);

  const targetEmail = (target.email as string | null) ?? "";

  const { token, expiresAt } = await signImpersonationToken({
    adminSub: admin!.adminSub,
    adminEmail: admin!.adminEmail,
    targetSub: target.id as string,
    targetEmail,
  });

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_IMPERSONATION_STARTED",
    targetUserId: target.id as string,
    targetEmail,
    route: "/admin/impersonation",
    metadata: { expiresAt },
  });

  return json({
    token,
    expiresAt,
    target: {
      id: target.id,
      email: targetEmail,
      name: (target.display_name as string | null) ?? (target.full_name as string | null) ?? null,
    },
  });
});