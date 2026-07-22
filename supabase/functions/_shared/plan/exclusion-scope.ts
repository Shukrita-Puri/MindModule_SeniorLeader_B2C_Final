/**
 * exclusion-scope.ts
 *
 * Write-time helpers for the Week Ahead → Plan exclusion SSOT.
 *
 * A `not_this_week` action captured on Sunday applies to the UPCOMING Mon–Sun
 * week — not to the ISO week containing occurred_at. Callers must pass the
 * target week explicitly. When the client omits it we fall back to the
 * upcoming user-local Monday–Sunday, never to the ISO week of `now()`.
 *
 * These helpers are timezone-aware. All week math is done in the user's IANA
 * zone by rendering an ISO date string in that zone and returning YYYY-MM-DD.
 */

export type MemoryScope = "permanent" | "target_week" | "occurrence" | "category_week" | "none";

export interface CanonicalIdentity {
  title: string;
  startMs: number;         // ms epoch, UTC
  durationMinutes: number; // minutes
  raw: string;             // original `canonical:...` value
}

/** Parse `canonical:<title>|<startMs>|<duration>`. Returns null on any parse failure. */
export function parseCanonicalIdentity(value: unknown): CanonicalIdentity | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("canonical:")) return null;
  const rest = value.slice("canonical:".length);
  const parts = rest.split("|");
  if (parts.length !== 3) return null;
  const [title, startStr, durationStr] = parts;
  const startMs = Number(startStr);
  const durationMinutes = Number(durationStr);
  if (!title || !Number.isFinite(startMs) || !Number.isFinite(durationMinutes)) return null;
  return { title, startMs, durationMinutes, raw: value };
}

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
export function toLocalDateString(date: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date); // en-CA gives YYYY-MM-DD
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Compute the ISO Monday–Sunday week that contains the given date, in the
 * given IANA timezone. Returns { start: YYYY-MM-DD, end: YYYY-MM-DD }.
 */
export function localWeekOf(date: Date, timezone: string): { start: string; end: string } {
  // Determine the local weekday (Mon=1..Sun=7).
  const localStr = toLocalDateString(date, timezone);
  const [y, m, d] = localStr.split("-").map(Number);
  // Treat the local date as if it were UTC for weekday arithmetic — this is
  // safe because we're only using it to shift by whole days.
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const jsDow = anchor.getUTCDay(); // 0=Sun..6=Sat
  const monOffset = ((jsDow + 6) % 7); // Mon=0..Sun=6
  const monday = new Date(anchor.getTime() - monOffset * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

/**
 * Given "now" in the user's timezone, compute the UPCOMING Mon–Sun week.
 *   Mon..Sat → next week's Mon–Sun.
 *   Sun     → the immediately-following Mon–Sun (i.e. tomorrow's week).
 */
export function upcomingWeek(now: Date, timezone: string): { start: string; end: string } {
  const localStr = toLocalDateString(now, timezone);
  const [y, m, d] = localStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const jsDow = anchor.getUTCDay(); // 0=Sun..6=Sat
  // Days until next Monday.
  const daysToNextMon = jsDow === 1 ? 7 : ((8 - jsDow) % 7 || 7);
  const monday = new Date(anchor.getTime() + daysToNextMon * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

/**
 * Signal → scope mapping. Only signals whose scope is `target_week` require
 * effective week fields. `permanent` (never) forbids them.
 */
export function scopeForSignal(signal: string): MemoryScope {
  if (signal === "never") return "permanent";
  if (signal === "not_this_week") return "target_week";
  return "none";
}

export function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}