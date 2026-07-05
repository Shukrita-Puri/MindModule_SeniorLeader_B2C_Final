// Admin-only analysis of `(user_id, identity_key)` duplicate groups in
// calendar_events. Does NOT mutate data. Intended to answer the question
// "is it safe to add a UNIQUE (user_id, identity_key) constraint?" before
// any enforcement migration is written.
//
// Reports:
//   - total rows with a non-null identity_key
//   - number of (user_id, identity_key) groups with >1 row
//   - total duplicate rows (sum(count - 1) over those groups)
//   - per-provider-pair collision counts (e.g. google↔apple, google↔microsoft)
//   - sample collisions with the fields a human needs to eyeball whether it
//     is a true cross-provider mirror or a false-positive (same normalized
//     title + start minute + duration for genuinely different meetings, e.g.
//     recurring "1:1" blocks with different attendees).
//
// Auth: SUPABASE_SERVICE_ROLE_KEY in Authorization header.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

type Row = {
  id: string;
  user_id: string;
  provider: string | null;
  title: string | null;
  start_time: string;
  end_time: string;
  external_id: string | null;
  identity_key: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";
    if (!serviceKey || !authHeader.includes(serviceKey)) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sampleLimit = Math.min(Math.max(Number(body.sampleLimit) || 25, 1), 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
      { auth: { persistSession: false } },
    );

    // Full scan is fine — table is small (thousands, not millions).
    // Paginate to defeat the 1k default limit.
    const rows: Row[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id,user_id,provider,title,start_time,end_time,external_id,identity_key")
        .not("identity_key", "is", null)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...(data as Row[]));
      if (data.length < pageSize) break;
    }

    // Group by (user_id, identity_key).
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.user_id}\u0000${r.identity_key}`;
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }

    let groupsWithDupes = 0;
    let duplicateRows = 0;
    const providerPairCounts: Record<string, number> = {};
    const dupeGroups: Row[][] = [];

    for (const arr of groups.values()) {
      if (arr.length <= 1) continue;
      groupsWithDupes++;
      duplicateRows += arr.length - 1;
      const providers = Array.from(
        new Set(arr.map((r) => (r.provider || "unknown").toLowerCase())),
      ).sort();
      const pairKey = providers.join("+");
      providerPairCounts[pairKey] = (providerPairCounts[pairKey] ?? 0) + 1;
      dupeGroups.push(arr);
    }

    // Sort worst-first: largest groups, then multi-provider groups first.
    dupeGroups.sort((a, b) => {
      const providersA = new Set(a.map((r) => (r.provider || "").toLowerCase())).size;
      const providersB = new Set(b.map((r) => (r.provider || "").toLowerCase())).size;
      if (providersA !== providersB) return providersB - providersA;
      return b.length - a.length;
    });

    // Classify each dupe group:
    //   likely_safe_merge: all rows in one group come from >1 distinct provider
    //     (classic cross-provider mirror — mergeCalendarEvents would fuse them)
    //   suspicious_collision: all rows come from the SAME provider, meaning
    //     identity_key collided but the source calendar itself kept them as
    //     separate events. This is the false-positive class that would break
    //     a UNIQUE constraint.
    let likelySafeMerges = 0;
    let suspiciousCollisions = 0;
    for (const arr of dupeGroups) {
      const providers = new Set(arr.map((r) => (r.provider || "").toLowerCase()));
      if (providers.size > 1) likelySafeMerges++;
      else suspiciousCollisions++;
    }

    const samples = dupeGroups.slice(0, sampleLimit).map((arr) => ({
      identity_key: arr[0].identity_key,
      row_count: arr.length,
      classification:
        new Set(arr.map((r) => (r.provider || "").toLowerCase())).size > 1
          ? "likely_safe_merge"
          : "suspicious_collision",
      rows: arr.map((r) => ({
        id: r.id,
        provider: r.provider,
        external_id: r.external_id,
        title: r.title,
        start_time: r.start_time,
        end_time: r.end_time,
      })),
    }));

    const uniqueSafetyRecommendation =
      suspiciousCollisions === 0
        ? "safe_to_enforce_unique"
        : "do_not_enforce_unique";

    return new Response(
      JSON.stringify({
        ok: true,
        scanned_rows: rows.length,
        total_groups: groups.size,
        groups_with_duplicates: groupsWithDupes,
        duplicate_rows: duplicateRows,
        likely_safe_merges: likelySafeMerges,
        suspicious_collisions: suspiciousCollisions,
        provider_pair_counts: providerPairCounts,
        unique_safety_recommendation: uniqueSafetyRecommendation,
        sample_groups: samples,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[analyze-calendar-identity-duplicates] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});