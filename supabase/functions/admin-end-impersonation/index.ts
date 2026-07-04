import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

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

  let body: { targetUserId?: string; targetEmail?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_IMPERSONATION_ENDED",
    targetUserId: body.targetUserId ?? null,
    targetEmail: body.targetEmail ?? null,
    route: "/admin",
  });

  // Impersonation is stateless (short-lived HS256 token). Client-side clear
  // is authoritative; we return OK so the frontend can unblock its UI.
  return json({ ok: true });
});