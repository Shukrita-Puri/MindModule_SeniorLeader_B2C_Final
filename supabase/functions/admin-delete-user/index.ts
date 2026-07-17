import { requireAdmin, writeAdminAudit, adminCorsHeaders, ADMIN_EMAIL_ALLOWLIST } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isProtectedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ADMIN_EMAIL_ALLOWLIST.some((a) => a.toLowerCase() === e);
}

const CONFIRMATION_PHRASE = "DELETE USER";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  const body = await req.json().catch(() => ({}));
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";

  if (!targetUserId) return json({ error: "userId required" }, 400);
  if (confirmation !== CONFIRMATION_PHRASE) {
    return json({ error: `Confirmation must equal "${CONFIRMATION_PHRASE}"` }, 400);
  }
  if (targetUserId === admin!.adminSub) {
    return json({ error: "Admins cannot delete their own account." }, 400);
  }

  const { data: targetProfile } = await db
    .from("profiles")
    .select("id, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetProfile) return json({ error: "User not found" }, 404);
  const targetEmail = (targetProfile.email as string | null) ?? null;
  if (isProtectedEmail(targetEmail)) {
    return json({ error: "This account is protected and cannot be deleted." }, 400);
  }

  // ==== AUDIT: STARTED ====
  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_USER_DELETE_STARTED",
    targetUserId,
    targetEmail,
    route: "/admin/users/:userId",
  });

  const startedAt = Date.now();
  try {
    const { data: counts, error } = await db.rpc("admin_delete_user_data", { _user_id: targetUserId });
    if (error) throw error;

    const durationMs = Date.now() - startedAt;
    await writeAdminAudit(db, {
      admin: admin!,
      action: "ADMIN_USER_DELETE_COMPLETED",
      targetUserId,
      targetEmail,
      route: "/admin/users/:userId",
      metadata: { counts, duration_ms: durationMs },
    });

    return json({ ok: true, target: { id: targetUserId, email: targetEmail }, counts, durationMs });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === "object"
          ? ((err as { message?: string }).message ??
             (err as { details?: string }).details ??
             (err as { hint?: string }).hint ??
             JSON.stringify(err))
          : String(err);
    console.error("[admin-delete-user] failed", message, err);
    await writeAdminAudit(db, {
      admin: admin!,
      action: "ADMIN_USER_DELETE_FAILED",
      targetUserId,
      targetEmail,
      route: "/admin/users/:userId",
      metadata: { error: message, duration_ms: Date.now() - startedAt },
    });
    return json({ error: message }, 500);
  }
});