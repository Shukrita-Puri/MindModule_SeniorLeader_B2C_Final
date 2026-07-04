/**
 * Admin Console allowlist — single source of truth.
 *
 * These two emails are the ONLY accounts allowed to see or use the Admin
 * Console. This list is duplicated verbatim in the backend guard at
 * `supabase/functions/_shared/admin-guard.ts` — keep both in sync.
 *
 * Frontend visibility relies on this list; server enforcement is separate
 * and must never trust the client.
 */
export const ADMIN_EMAIL_ALLOWLIST: readonly string[] = [
  'shukrita@mindmodule.me',
  'itsmanojkdev@gmail.com',
] as const;

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAIL_ALLOWLIST.some((entry) => entry.toLowerCase() === normalized);
}