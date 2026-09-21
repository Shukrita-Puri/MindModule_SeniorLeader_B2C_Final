/**
 * Manual App Store download figures, entered by an admin in the console.
 * Read-only for the rest of the system; nothing else reads this table.
 */
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
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  try {
    const body = await req.json().catch(() => null);
    const date = typeof body?.date === "string" ? body.date.slice(0, 10) : "";
    const downloads = Number(body?.downloads);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "date must be YYYY-MM-DD" }, 400);
    }
    if (!Number.isFinite(downloads) || downloads < 0 || downloads > 1_000_000) {
      return json({ error: "downloads must be between 0 and 1000000" }, 400);
    }

    const { error } = await db.from("app_store_downloads").upsert(
      {
        download_date: date,
        downloads: Math.round(downloads),
        entered_by: admin!.adminEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "download_date" },
    );
    if (error) return json({ error: error.message }, 500);

    await writeAdminAudit(db, {
      admin: admin!,
      action: "ADMIN_SET_APP_STORE_DOWNLOADS",
      route: "/admin/users",
      metadata: { date, downloads: Math.round(downloads) },
    });

    return json({ ok: true, date, downloads: Math.round(downloads) });
  } catch (err) {
    console.error("[admin-set-app-store-downloads] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
