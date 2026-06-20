// Proactive post-sync attendee resolver queue.
//
// Used by `sync-calendar` (Google/Microsoft) and `sync-apple-calendar` to
// fire `resolve-attendee-relationship` for unresolved external attendees
// AFTER calendar events have been persisted. Fire-and-forget — never
// blocks the sync response. The lazy in-Plan resolver remains as a
// backstop for races and for users who tag relationships out-of-band.

const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com",
  "proton.me", "protonmail.com",
]);

const MAX_EMAILS_PER_SYNC = 25;
const PER_CALL_CONCURRENCY = 3;

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).toLowerCase().trim();
}

function isGeneric(email: string): boolean {
  return GENERIC_DOMAINS.has(domainOf(email));
}

export interface ResolverQueueStats {
  candidates: number;
  queued: number;
  skipped_generic: number;
  skipped_cached: number;
  failed: number;
}

interface AttendeeLike {
  email?: string | null;
  isSelf?: boolean;
}

/**
 * Walk synced events, extract unique unresolved attendee emails,
 * exclude self / generic / fresh-cached entries.
 */
export async function collectUnresolvedAttendeeEmails(
  supabase: any,
  userId: string,
  syncedEvents: Array<{ event_metadata?: { attendeeSignals?: AttendeeLike[] } }>,
): Promise<{ emails: string[]; skipped_generic: number; skipped_cached: number }> {
  const collected = new Set<string>();
  let skippedGeneric = 0;
  for (const ev of syncedEvents) {
    const signals = ev?.event_metadata?.attendeeSignals;
    if (!Array.isArray(signals)) continue;
    for (const s of signals) {
      if (!s?.email || s.isSelf) continue;
      const email = String(s.email).toLowerCase().trim();
      if (!email.includes("@")) continue;
      if (isGeneric(email)) { skippedGeneric++; continue; }
      collected.add(email);
    }
  }
  if (collected.size === 0) {
    return { emails: [], skipped_generic: skippedGeneric, skipped_cached: 0 };
  }

  // Drop emails that already have a fresh (non-expired) cache row.
  const all = Array.from(collected);
  let skippedCached = 0;
  try {
    const { data: cached } = await supabase
      .from("attendee_relationships")
      .select("attendee_email, expires_at")
      .eq("user_id", userId)
      .in("attendee_email", all);
    const freshSet = new Set<string>();
    const nowMs = Date.now();
    for (const r of (cached ?? [])) {
      if (r?.expires_at && new Date(r.expires_at).getTime() > nowMs) {
        freshSet.add(r.attendee_email);
      }
    }
    const fresh: string[] = [];
    const unresolved: string[] = [];
    for (const e of all) (freshSet.has(e) ? fresh : unresolved).push(e);
    skippedCached = fresh.length;
    return {
      emails: unresolved.slice(0, MAX_EMAILS_PER_SYNC),
      skipped_generic: skippedGeneric,
      skipped_cached: skippedCached,
    };
  } catch {
    return {
      emails: all.slice(0, MAX_EMAILS_PER_SYNC),
      skipped_generic: skippedGeneric,
      skipped_cached: 0,
    };
  }
}

/**
 * Fan out resolver calls with bounded concurrency. Returns aggregate
 * counts only (no PII in logs). Resolver self-enforces a 50/user/day cap.
 */
export async function fireResolverBatch(
  userId: string,
  emails: string[],
): Promise<{ queued: number; failed: number }> {
  if (emails.length === 0) return { queued: 0, failed: 0 };
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !key) return { queued: 0, failed: emails.length };

  let queued = 0;
  let failed = 0;
  const url = `${base}/functions/v1/resolve-attendee-relationship`;

  const fireOne = async (attendee_email: string) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ user_id: userId, attendee_email }),
      });
      if (res.ok) queued++;
      else failed++;
      // Drain body to free socket.
      try { await res.text(); } catch { /* ignore */ }
    } catch {
      failed++;
    }
  };

  // Simple sliding-window concurrency.
  const queue = [...emails];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(PER_CALL_CONCURRENCY, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        await fireOne(next);
      }
    })());
  }
  await Promise.all(workers);
  return { queued, failed };
}

/**
 * Fire-and-forget wrapper. Safe to await briefly or detach entirely;
 * never throws. Designed so calendar sync responds without waiting.
 */
export function detachResolverBatch(
  userId: string,
  emails: string[],
  tag: string,
): void {
  if (emails.length === 0) return;
  const promise = (async () => {
    try {
      const stats = await fireResolverBatch(userId, emails);
      console.log(`[${tag}] resolver_batch queued=${stats.queued} failed=${stats.failed} attempted=${emails.length}`);
    } catch (e) {
      console.warn(`[${tag}] resolver_batch error category=net msg=${(e as Error)?.message}`);
    }
  })();
  // EdgeRuntime.waitUntil keeps the worker alive on Supabase Edge Runtime
  // until the promise settles, without blocking the response.
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    try { er.waitUntil(promise); } catch { /* ignore */ }
  }
}