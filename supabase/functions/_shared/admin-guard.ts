/**
 * Admin guard — the ONE place every /admin edge function proves the caller
 * is one of the two authorized admins.
 *
 * Rules (mirrors src/config/adminAllowlist.ts):
 *   - Caller MUST present a valid Auth0 JWT (verified via _shared/auth.ts).
 *   - Caller's email (resolved from public.profiles by Auth0 sub) MUST be
 *     in the hard-coded allowlist below.
 *   - Dev bypass (x-dev-user-id) is REJECTED in production (auth.ts already
 *     ignores it in prod; we double-check APP_ENV here anyway).
 *   - `ADMIN_SUBS_CSV` is NOT consulted by this guard. Legacy admin
 *     functions (certificate-requests-admin-list, manage-beta-invites) still
 *     use it and are unchanged.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT, isProductionEnv } from "./auth.ts";

export const ADMIN_EMAIL_ALLOWLIST: readonly string[] = [
  "shukrita@mindmodule.me",
  "itsmanojkdev@gmail.com",
] as const;

export interface AdminIdentity {
  adminSub: string;
  adminEmail: string;
}

export interface AdminGuardResult {
  admin?: AdminIdentity;
  /** Service-role client — safe to use ONLY after `admin` is set. */
  db: ReturnType<typeof createClient>;
  errorResponse?: Response;
}

export function adminCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-impersonation-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAIL_ALLOWLIST.some((e) => e.toLowerCase() === normalized);
}

/**
 * Verify caller is an authorized admin. Returns `{ admin, db }` on success
 * or `{ db, errorResponse }` when the caller must be rejected.
 *
 * Callers should return `result.errorResponse` immediately if present.
 */
export async function requireAdmin(req: Request): Promise<AdminGuardResult> {
  const cors = adminCorsHeaders();
  const db = getServiceClient();

  // Admin APIs ALWAYS authorize the real caller. If somebody attaches an
  // impersonation token to an /admin call, log and ignore it — never let
  // impersonation grant admin rights.
  if (req.headers.get("x-impersonation-token")) {
    console.warn("[admin-guard] x-impersonation-token ignored on admin call");
  }

  // In production, refuse the dev header outright even if auth.ts also
  // strips it — belt and suspenders.
  if (isProductionEnv() && req.headers.get("x-dev-user-id")) {
    console.warn("[admin-guard] x-dev-user-id header rejected in production");
    return { db, errorResponse: json({ error: "Forbidden" }, 403, cors) };
  }

  let sub: string;
  try {
    sub = await verifyAuth0JWT(req.headers.get("Authorization"), req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    console.warn("[admin-guard] JWT verification failed:", msg);
    return { db, errorResponse: json({ error: "Unauthorized" }, 401, cors) };
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, email")
    .eq("id", sub)
    .maybeSingle();

  if (error) {
    console.error("[admin-guard] profile lookup failed:", error);
    return { db, errorResponse: json({ error: "Server error" }, 500, cors) };
  }

  const email = (profile?.email as string | undefined) ?? null;
  if (!isEmailAllowlisted(email)) {
    console.warn("[admin-guard] non-admin access attempt", { sub, email });
    return { db, errorResponse: json({ error: "Forbidden" }, 403, cors) };
  }

  return { db, admin: { adminSub: sub, adminEmail: email! } };
}

/**
 * Insert an entry into `public.audit_logs` for an admin action.
 * Never throws — audit failures are logged and swallowed so the caller's
 * primary work is not blocked by a logging outage.
 */
export async function writeAdminAudit(
  db: ReturnType<typeof createClient>,
  params: {
    admin: AdminIdentity;
    action: string;
    targetUserId?: string | null;
    targetEmail?: string | null;
    route?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const metadata = {
      admin_email: params.admin.adminEmail,
      target_user_id: params.targetUserId ?? null,
      target_email: params.targetEmail ?? null,
      route: params.route ?? null,
      ...(params.metadata ?? {}),
    };
    const { error } = await db.from("audit_logs").insert({
      actor: params.admin.adminSub,
      action: params.action,
      table_name: "admin_console",
      record_id: params.targetUserId ?? params.admin.adminSub,
      metadata,
    });
    if (error) console.error("[admin-guard] audit insert failed:", error);
  } catch (err) {
    console.error("[admin-guard] audit threw:", err);
  }
}