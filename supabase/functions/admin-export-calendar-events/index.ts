import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

/**
 * Admin-only export of raw calendar events for hand-labeling.
 *
 * Reads raw calendar_events on purpose (no cross-provider merge) so the
 * labeler sees exactly what is stored. Returns JSON rows; the admin UI turns
 * them into a CSV download. Read-only: nothing is written except an audit row.
 */

const cors = adminCorsHeaders();
const TARGET_EMAIL = "shukrita@mindmodule.me";
const ROW_LIMIT = 350;

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
    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("id, email")
      .ilike("email", TARGET_EMAIL)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) return json({ error: `No profile found for ${TARGET_EMAIL}` }, 404);

    const { data: events, error: eventsErr } = await db
      .from("calendar_events")
      .select(
        "id, title, description, location, start_time, end_time, attendees, is_recurring, recurring_event_id, event_category, event_subcategory",
      )
      .eq("user_id", profile.id)
      .order("start_time", { ascending: false })
      .limit(ROW_LIMIT);
    if (eventsErr) throw eventsErr;

    const rows = (events ?? []).map((evt: Record<string, unknown>, idx: number) => {
      const attendees = Array.isArray(evt.attendees) ? (evt.attendees as Record<string, unknown>[]) : [];
      const domains = new Set<string>();
      for (const a of attendees) {
        const email = typeof a?.email === "string" ? a.email : null;
        const domain = email && email.includes("@") ? email.split("@")[1]?.trim().toLowerCase() : null;
        if (domain) domains.add(domain);
      }
      const startMs = evt.start_time ? new Date(evt.start_time as string).getTime() : NaN;
      const endMs = evt.end_time ? new Date(evt.end_time as string).getTime() : NaN;
      const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.round((endMs - startMs) / 60000)
        : null;

      return {
        index: idx + 1,
        id: evt.id,
        title: evt.title ?? "",
        description: evt.description ?? "",
        location: evt.location ?? "",
        start_time: evt.start_time ?? "",
        end_time: evt.end_time ?? "",
        durationMinutes,
        is_recurring: !!(evt.is_recurring || evt.recurring_event_id),
        recurring_event_id: evt.recurring_event_id ?? "",
        attendees_count: attendees.length,
        attendee_domains: Array.from(domains).join("; "),
        legacy_category: evt.event_category ?? "",
        legacy_subtype: evt.event_subcategory ?? "",
        shukrita_correct_category: "",
        shukrita_correct_subtype: "",
        shukrita_difficulty: "",
        shukrita_notes: "",
      };
    });

    await writeAdminAudit(db, {
      admin: admin!,
      action: "ADMIN_EXPORT_CALENDAR_EVENTS",
      targetUserId: profile.id as string,
      targetEmail: TARGET_EMAIL,
      route: "/admin",
      metadata: { row_count: rows.length },
    });

    return json({ rows, count: rows.length });
  } catch (err) {
    console.error("[admin-export-calendar-events] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
