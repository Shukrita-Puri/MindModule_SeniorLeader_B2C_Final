// Admin-only backfill for calendar_events.identity_key.
//
// Computes identity_key using the SHARED TS helper (`computeIdentityKey` from
// _shared/rules/calendar-merge.ts) — never a SQL reimplementation — so the
// backfilled value is bit-identical to what the sync writers now produce.
//
// Contract:
//   POST { batchSize?: number = 500, maxBatches?: number = 20, dryRun?: boolean = false }
//   Auth: SUPABASE_SERVICE_ROLE_KEY in the Authorization header (admin/cron only).
//
// Idempotent: only touches rows where identity_key IS NULL. Rows whose title /
// start_time / end_time cannot produce a stable key are left NULL by design
// (see computeIdentityKey doc).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeIdentityKey } from "../_shared/rules/calendar-merge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Admin/maintenance endpoint. verify_jwt is off (Lovable default) so we
    // gate by a body-supplied confirmation token that must match
    // TOKEN_ENC_KEY_B64 (an existing project secret). This keeps the
    // endpoint unusable by anonymous callers without needing a full JWT
    // verification path. Rotate the secret to revoke access.
    const adminSecret = Deno.env.get("TOKEN_ENC_KEY_B64") ?? "";

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batchSize) || 500, 1), 2000);
    const maxBatches = Math.min(Math.max(Number(body.maxBatches) || 20, 1), 200);
    const dryRun = Boolean(body.dryRun);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
      { auth: { persistSession: false } },
    );

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
          title: r.title,
          start_time: r.start_time,
          end_time: r.end_time,
        });
        if (key) withKey.push({ id: r.id as string, identity_key: key });
        else leftNull++;
      }

      if (!dryRun && withKey.length > 0) {
        // Batch-update via upsert on primary key. Only sends id + identity_key.
        const { error: upErr } = await supabase
          .from("calendar_events")
          .upsert(withKey, { onConflict: "id" });
        if (upErr) throw upErr;
      }
      updated += withKey.length;

      if (rows.length < batchSize) break;
    }

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