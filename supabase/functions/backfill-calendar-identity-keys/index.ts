// Admin-only backfill for calendar_events.identity_key.
//
// Computes identity_key using the SHARED TS helper (`computeIdentityKey` from
// _shared/rules/calendar-merge.ts) — never a SQL reimplementation — so the
// backfilled value is bit-identical to what the sync writers now produce.
//
// Idempotent: only touches rows where identity_key IS NULL. Rows whose title /
// start_time / end_time cannot produce a stable key are left NULL by design
// (see computeIdentityKey doc).
//
// Auth: `requireAdmin` — caller must present a valid Auth0 JWT whose profile
// email is in ADMIN_EMAIL_ALLOWLIST (see _shared/admin-guard.ts).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { computeIdentityKey } from "../_shared/rules/calendar-merge.ts";
import { requireAdmin, writeAdminAudit } from "../_shared/admin-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const supabase = guard.db;

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batchSize) || 500, 1), 2000);
    const maxBatches = Math.min(Math.max(Number(body.maxBatches) || 20, 1), 200);
    const dryRun = Boolean(body.dryRun);

    let scanned = 0;
    let updated = 0;
    let leftNull = 0;
    let batches = 0;

    for (let i = 0; i < maxBatches; i++) {
      const { data: rows, error } = await supabase
        .from("calendar_events")
        .select("id,title,start_time,end_time")
        .is("identity_key", null)
        .limit(batchSize);
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      batches++;
      scanned += rows.length;

      const withKey: { id: string; identity_key: string }[] = [];
      for (const r of rows) {
        const key = computeIdentityKey({
          title: r.title as string | null,
          start_time: r.start_time as string,
          end_time: r.end_time as string,
        });
        if (key) withKey.push({ id: r.id as string, identity_key: key });
        else leftNull++;
      }

      if (!dryRun && withKey.length > 0) {
        // Per-row UPDATE (never upsert — upsert would try to INSERT a
        // partial row and violate NOT NULL on user_id/start_time/etc.).
        for (const w of withKey) {
          const { error: upErr } = await supabase
            .from("calendar_events")
            .update({ identity_key: w.identity_key })
            .eq("id", w.id);
          if (upErr) throw upErr;
        }
      }
      updated += withKey.length;

      if (rows.length < batchSize) break;
    }

    await writeAdminAudit(supabase, {
      admin: guard.admin!,
      action: "backfill_calendar_identity_keys",
      metadata: { dryRun, batches, scanned, updated, leftNull },
    });

    return new Response(
      JSON.stringify({ ok: true, dryRun, batches, scanned, updated, leftNull }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[backfill-calendar-identity-keys] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});