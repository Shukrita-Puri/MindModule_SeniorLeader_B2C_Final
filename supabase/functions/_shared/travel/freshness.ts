// Sprint 10 / Phase 9B — travel_state staleness guard for Brief / Plan consumers.
//
// Contract (see Sprint 9/10 review):
//   • `updated_at` alone is NOT proof of a fresh travel signal.
//     The scheduled `travel-state-sync` producer also touches
//     `updated_at` on skip runs (freshness bookkeeping only), so any
//     consumer that treats `updated_at` as "state was refreshed by a
//     real signal" will falsely trust dead rows.
//   • Use `last_state_change_at` (state actually changed) or
//     `last_location_at` (real coord fix from persist-travel-location)
//     as the freshness signal.
//   • `meta.last_sync_at` = "the sync job checked this user"; useful
//     for admin/telemetry only, NEVER for signal freshness.
//
// Windows chosen so that a genuinely away user whose device has been
// dark for a couple of days is still trusted, while a row that has been
// static for weeks with no location fix is ignored.

export const LOCATION_FRESH_HOURS = 24;
export const STATE_CHANGE_FRESH_DAYS = 14;

export interface TravelFreshnessInput {
  state: string | null | undefined;
  lastStateChangeAt: string | null | undefined;
  lastLocationAt: string | null | undefined;
  now: Date;
}

export type TravelFreshnessReason = "fresh" | "stale" | "missing" | "no_signal";

export interface TravelFreshnessResult {
  used: boolean;
  reason: TravelFreshnessReason;
}

function ageMs(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return now.getTime() - t;
}

/**
 * Decide whether a hydrated travel_state row is fresh enough to be
 * trusted by Brief / Plan consumers.
 *
 * `missing`   — no row at all
 * `no_signal` — row exists but has neither a state-change nor a
 *               location-fix timestamp (only produced by sync writes)
 * `stale`     — timestamps present but older than the freshness windows
 * `fresh`     — trustable signal within windows
 */
export function decideTravelFreshness(
  row: TravelFreshnessInput | null | undefined,
): TravelFreshnessResult {
  if (!row) return { used: false, reason: "missing" };
  const stateAge = ageMs(row.lastStateChangeAt, row.now);
  const locAge = ageMs(row.lastLocationAt, row.now);
  if (stateAge == null && locAge == null) {
    return { used: false, reason: "no_signal" };
  }
  const stateFresh = stateAge != null && stateAge <= STATE_CHANGE_FRESH_DAYS * 24 * 3600 * 1000;
  const locFresh = locAge != null && locAge <= LOCATION_FRESH_HOURS * 3600 * 1000;
  if (stateFresh || locFresh) return { used: true, reason: "fresh" };
  return { used: false, reason: "stale" };
}