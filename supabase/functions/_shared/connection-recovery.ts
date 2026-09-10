/**
 * Connection recovery — shared contract.
 *
 * One place that decides whether a user's watch, calendar or push channel is
 * currently broken, plus small helpers around `connection_recovery_requests`.
 *
 * Read-only by design apart from the two explicit write helpers.
 */

export type RecoveryIssue = "wearable" | "calendar" | "push";

export const RECOVERY_STALE_DAYS = 3;
/** Admin re-request rate limit. */
export const RECOVERY_REQUEST_COOLDOWN_HOURS = 24;
/** Wait this long after the first in-app prompt before pushing. */
export const RECOVERY_PUSH_DELAY_DAYS = 3;
/** At most one push per issue in this window. */
export const RECOVERY_PUSH_COOLDOWN_DAYS = 14;
/** Stop showing the in-app prompt after this many shows. */
export const RECOVERY_MAX_PROMPT_SHOWS = 3;
/** Snooze between in-app prompts. */
export const RECOVERY_PROMPT_SNOOZE_DAYS = 5;

export interface ConnectionIssue {
  issue: RecoveryIssue;
  /** Short machine-ish reason, e.g. "permission_revoked" | "no_samples_3d". */
  reason: string;
  /** Human sentence for the admin alerts panel. */
  detail: string;
  /** When this problem started, if we can tell. */
  since: string | null;
}

export interface ConnectionHealthInputs {
  integration: {
    watch_connection_status?: string | null;
    watch_sync_status?: string | null;
    watch_last_sync_at?: string | null;
    watch_last_sample_at?: string | null;
    watch_last_error?: string | null;
  } | null;
  calendars: Array<{
    is_active?: boolean | null;
    sync_status?: string | null;
    updated_at?: string | null;
  }>;
  tokens: Array<{
    is_active?: boolean | null;
    platform?: string | null;
    updated_at?: string | null;
  }>;
  /** Most recent APNs results for this user, newest first. */
  recentApns: Array<{ apns_status?: number | null; sent_at?: string | null }>;
  /** Set false when the user has never connected a watch at all. */
  everHadWearable: boolean;
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Pure evaluation — no I/O, so it can be unit tested and reused by both the
 * admin alerts listing and the single-user diagnostic.
 */
export function evaluateConnectionIssues(
  input: ConnectionHealthInputs,
): ConnectionIssue[] {
  const issues: ConnectionIssue[] = [];
  const integration = input.integration;

  // ---- Wearable -----------------------------------------------------------
  if (input.everHadWearable && integration) {
    const connection = (integration.watch_connection_status ?? "").toLowerCase();
    const sync = (integration.watch_sync_status ?? "").toLowerCase();
    const sampleAge = daysAgo(integration.watch_last_sample_at);

    if (connection === "permission_revoked" || sync === "permission_revoked") {
      issues.push({
        issue: "wearable",
        reason: "permission_revoked",
        detail: "Health permissions were revoked on the device.",
        since: integration.watch_last_sync_at ?? null,
      });
    } else if (connection === "disconnected") {
      issues.push({
        issue: "wearable",
        reason: "disconnected",
        detail: "Apple Watch is disconnected.",
        since: integration.watch_last_sync_at ?? null,
      });
    } else if (sync === "error") {
      issues.push({
        issue: "wearable",
        reason: "sync_error",
        detail: integration.watch_last_error
          ? `Sync failing: ${integration.watch_last_error}`
          : "Watch sync is failing.",
        since: integration.watch_last_sync_at ?? null,
      });
    } else if (sampleAge !== null && sampleAge >= RECOVERY_STALE_DAYS) {
      issues.push({
        issue: "wearable",
        reason: "no_samples",
        detail: `No health samples for ${Math.floor(sampleAge)} days.`,
        since: integration.watch_last_sample_at ?? null,
      });
    }
  }

  // ---- Calendar -----------------------------------------------------------
  const calendars = input.calendars ?? [];
  if (calendars.length > 0) {
    const anyHealthy = calendars.some(
      (c) => c.is_active !== false && (c.sync_status ?? "").toLowerCase() !== "error",
    );
    if (!anyHealthy) {
      const newest = calendars
        .map((c) => c.updated_at ?? null)
        .filter(Boolean)
        .sort()
        .pop() ?? null;
      issues.push({
        issue: "calendar",
        reason: "disconnected",
        detail: "Every connected calendar is inactive or failing to sync.",
        since: newest,
      });
    }
  }

  // ---- Push ---------------------------------------------------------------
  const tokens = input.tokens ?? [];
  const activeTokens = tokens.filter((t) => t.is_active === true);
  if (tokens.length > 0 && activeTokens.length === 0) {
    issues.push({
      issue: "push",
      reason: "no_active_token",
      detail: "All push tokens are inactive — notifications cannot be delivered.",
      since: tokens.map((t) => t.updated_at ?? null).filter(Boolean).sort().pop() ?? null,
    });
  } else if (input.recentApns.length >= 3) {
    const allRejected = input.recentApns.every(
      (r) => typeof r.apns_status === "number" && r.apns_status >= 400,
    );
    if (allRejected) {
      issues.push({
        issue: "push",
        reason: "apns_rejected",
        detail: "Recent pushes were all rejected by Apple.",
        since: input.recentApns[input.recentApns.length - 1]?.sent_at ?? null,
      });
    }
  }

  return issues;
}

/** Mark any open recovery rows for this issue as resolved. Best-effort. */
export async function resolveRecoveryIssue(
  // deno-lint-ignore no-explicit-any
  db: any,
  userId: string,
  issue: RecoveryIssue,
): Promise<void> {
  try {
    await db
      .from("connection_recovery_requests")
      .update({ resolved_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("issue", issue)
      .is("resolved_at", null);
  } catch (err) {
    console.warn("[connection-recovery] resolve failed", String(err));
  }
}
