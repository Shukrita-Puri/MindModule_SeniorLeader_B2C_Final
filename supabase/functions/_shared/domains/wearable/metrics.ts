/**
 * derive-sleep-efficiency.ts — SSOT for computing sleep efficiency (0–100)
 * from provider raw payloads. Used by:
 *  • persist-wearable-data (HealthKit upserts)
 *  • sync-oura (Oura cloud sync)
 *  • compute-outer-readiness (fallback when stored column is null on
 *    legacy rows synced before the sleep_efficiency migration)
 *
 * Priority order:
 *   1. raw_data.efficiency               (Oura summary surface)
 *   2. raw_data.sleep.efficiency         (nested sleep object)
 *   3. time_in_bed + total_sleep_minutes (derive)
 */

export function deriveSleepEfficiency(
  rawData: unknown,
  totalSleepMinutes: number | null | undefined,
): number | null {
  const raw = (rawData ?? {}) as Record<string, any>;
  let eff: number | null = null;

  if (typeof raw?.efficiency === 'number') {
    eff = Math.round(raw.efficiency);
  } else if (typeof raw?.sleep?.efficiency === 'number') {
    eff = Math.round(raw.sleep.efficiency);
  } else if (typeof raw?.time_in_bed === 'number' && typeof totalSleepMinutes === 'number') {
    const tib = raw.time_in_bed;
    // Oura returns time_in_bed in SECONDS; HealthKit in MINUTES. Anything
    // over ~1000 we assume is seconds.
    const tibMin = tib > 1000 ? tib / 60 : tib;
    if (tibMin > 0) eff = Math.round((totalSleepMinutes / tibMin) * 100);
  }

  if (eff == null) return null;
  return Math.max(0, Math.min(100, eff));
}

/**
 * Oura-specific helper: a single sleep session row exposes `efficiency`
 * directly. Returns the rounded integer or null.
 */
export function ouraSleepEfficiencyFromSession(
  session: { efficiency?: number | null; total_sleep_duration?: number | null; time_in_bed?: number | null } | null | undefined,
): number | null {
  if (!session) return null;
  if (typeof session.efficiency === 'number') {
    return Math.max(0, Math.min(100, Math.round(session.efficiency)));
  }
  if (typeof session.total_sleep_duration === 'number' && typeof session.time_in_bed === 'number' && session.time_in_bed > 0) {
    return Math.max(0, Math.min(100, Math.round((session.total_sleep_duration / session.time_in_bed) * 100)));
  }
  return null;
}