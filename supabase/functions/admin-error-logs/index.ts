import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Redact any object property whose key looks sensitive. Applied recursively
// to metadata blobs we return to the admin UI so tokens / secrets never
// leak, even if a future code path logs one into an audit or run row.
const SENSITIVE_KEY = /(token|secret|password|apikey|api_key|authorization|jwks|apns|refresh|access_token|bearer|p8|client_secret)/i;
function sanitize(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      out[k] = sanitize(v);
    } else if (typeof v === "string" && v.length > 40 && /^ey[A-Za-z0-9_-]{20,}\./.test(v)) {
      // Heuristic JWT-ish redaction.
      out[k] = "[redacted-token]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isoHoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  const url = new URL(req.url);
  const sinceIso = url.searchParams.get("since") ?? isoHoursAgo(24 * 7);
  const source = url.searchParams.get("source"); // optional filter
  const search = (url.searchParams.get("q") ?? "").trim();
  const userIdFilter = url.searchParams.get("userId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  const promises: Array<Promise<{ source: string; rows: any[] }>> = [];

  if (!source || source === "executive_home_card_runs") {
    let q = db
      .from("executive_home_card_runs")
      .select("run_id, user_id, local_date, window, mode, status, error, duration_ms, created_at")
      .eq("status", "error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    promises.push(
      q.then(({ data }) => ({
        source: "executive_home_card_runs",
        rows: (data ?? []).map((r: any) => ({
          id: r.run_id,
          time: r.created_at,
          source: "build-executive-home-cards",
          severity: "error",
          userId: r.user_id,
          summary: (r.error ?? "").split("\n")[0]?.slice(0, 240) ?? "Build failed",
          details: sanitize({ ...r }),
          relatedRunId: r.run_id,
          status: r.status,
        })),
      })),
    );
  }

  if (!source || source === "notification_log") {
    let q = db
      .from("notification_log")
      .select("*")
      .gte("created_at", sinceIso)
      .in("status", ["failed", "error", "bounced"] as any)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    promises.push(
      q.then(({ data, error }) => {
        if (error) return { source: "notification_log", rows: [] };
        return {
          source: "notification_log",
          rows: (data ?? []).map((r: any) => ({
            id: r.id,
            time: r.created_at,
            source: "notification-log",
            severity: "error",
            userId: r.user_id ?? null,
            summary: (r.error_message ?? r.status ?? "notification failed").toString().slice(0, 240),
            details: sanitize(r),
            relatedRunId: null,
            status: r.status,
          })),
        };
      }),
    );
  }

  if (!source || source === "audit_logs") {
    let q = db
      .from("audit_logs")
      .select("id, actor, action, table_name, record_id, metadata, created_at")
      .gte("created_at", sinceIso)
      .or("action.ilike.%FAILED%,action.ilike.%ERROR%")
      .order("created_at", { ascending: false })
      .limit(limit);
    promises.push(
      q.then(({ data }) => ({
        source: "audit_logs",
        rows: (data ?? []).map((r: any) => ({
          id: r.id,
          time: r.created_at,
          source: r.action,
          severity: "error",
          userId: (r.metadata?.target_user_id as string | null) ?? r.actor ?? null,
          summary: (r.action ?? "audit").toString(),
          details: sanitize(r.metadata ?? {}),
          relatedRunId: null,
          status: "error",
        })),
      })),
    );
  }

  const settled = await Promise.all(promises);
  let rows = settled.flatMap((s) => s.rows);
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((r) =>
      (r.summary ?? "").toLowerCase().includes(needle) ||
      JSON.stringify(r.details ?? {}).toLowerCase().includes(needle),
    );
  }
  rows.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
  rows = rows.slice(0, limit);

  return json({
    generatedAt: new Date().toISOString(),
    sinceIso,
    total: rows.length,
    rows,
  });
});