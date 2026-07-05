type Provider = 'oura' | 'apple-healthkit' | 'unknown';

/**
 * Explicit provenance for a wearable metric. Unlike the coarse `Provider`
 * label (which cannot distinguish direct-Oura from Oura routed through Apple
 * Health), `Provenance` captures the true origin so merge priority is not
 * fooled by the ambiguous "oura" tag on a mirrored HealthKit row.
 *
 * States:
 *  - `direct_oura`              — synced from the Oura API directly (sync-oura)
 *  - `apple_health_native`      — sample originated on an Apple sensor
 *                                 (Apple Watch or iPhone) surfaced via HealthKit
 *  - `oura_via_apple_health`    — Oura Ring data mirrored through HealthKit
 *  - `third_party_via_apple_health` — Whoop/Garmin/Fitbit/etc. via HealthKit.
 *                                 New providers land here by default (extensible).
 *  - `unknown`                  — legacy row / unresolvable provenance.
 *
 * To add a real provider (Garmin, Whoop, Fitbit) with first-class rules:
 *   1. Add its bundle-id detection in the caller (see iOS
 *      `WearableSyncBridge.providerForBundle`) so `source_provider` is
 *      emitted as `<provider>_via_apple_health` OR a direct label like
 *      `garmin` for native SDK writes.
 *   2. Extend `Provenance` with a `direct_<provider>` variant if a native
 *      ingestion path is added, and set its priority in `provenanceRank`.
 * Until step 2 lands, `third_party_via_apple_health` is a safe fallback that
 * keeps rows persisted and reconcilable.
 */
export type Provenance =
  | 'direct_oura'
  | 'apple_health_native'
  | 'oura_via_apple_health'
  | 'third_party_via_apple_health'
  | 'unknown';

type MetricKey =
  | 'hrv'
  | 'hrv_samples'
  | 'resting_heart_rate'
  | 'heart_rate'
  | 'hr_samples'
  | 'total_sleep_minutes'
  | 'deep_sleep_minutes'
  | 'rem_sleep_minutes'
  | 'sleep_score'
  | 'sleep_efficiency';

type SourceApps = Record<string, string[]>;

type WearableRowLike = Record<string, unknown> & {
  source?: string | null;
  source_provider?: string | null;
  source_apps?: unknown;
};

/**
 * Connection-state context loaded from oura_connections / wearable_data.
 * Passed into the merge so priority is decided from actual connection state,
 * not just the source tag on the incoming row.
 *
 * - ouraDirectConnected: user has an active direct-Oura OAuth connection
 *   (oura_connections.connection_status === 'connected').
 * - ouraWritesToAppleHealth: user's Oura ring is configured to mirror data
 *   into Apple Health (so an "apple-healthkit"-tagged row may actually be
 *   Oura data flowing through HealthKit — should be deprioritised vs. a
 *   real Apple Watch write for HR / hr_samples).
 * - appleWatchPresentToday: any Apple Watch-originated sample exists for
 *   this user/day. When true, HR + hr_samples hard-prefer Apple Watch.
 */
export type WearableMergeContext = {
  ouraDirectConnected: boolean;
  ouraWritesToAppleHealth: boolean;
  appleWatchPresentToday: boolean;
};

export const DEFAULT_MERGE_CONTEXT: WearableMergeContext = {
  ouraDirectConnected: false,
  ouraWritesToAppleHealth: false,
  appleWatchPresentToday: false,
};

/** Recency-guard threshold (hours). See mem://.../recency-guard-threshold. */
export const DEFAULT_RECENCY_GUARD_HOURS = 12;

export type ReconciliationRecord = {
  metric: MetricKey;
  winning_source: string | null;
  losing_source: string | null;
  winning_updated_at: string | null;
  losing_updated_at: string | null;
  delta_hours: number;
  reason: 'recency_guard_blocked_overwrite';
  details: Record<string, unknown>;
};

export type MergeOptions = {
  context?: WearableMergeContext;
  recencyGuardHours?: number;
  onReconciliation?: (record: ReconciliationRecord) => void;
};

const SLEEP_METRICS: MetricKey[] = [
  'total_sleep_minutes',
  'deep_sleep_minutes',
  'rem_sleep_minutes',
  'sleep_score',
  'sleep_efficiency',
];

const HEART_METRICS: MetricKey[] = [
  'heart_rate',
  'hr_samples',
];

const HRV_METRICS: MetricKey[] = [
  'hrv',
  'hrv_samples',
  'resting_heart_rate',
];

/**
 * Coarse provider inference retained for legacy call sites. Downstream merge
 * logic should use `resolveMetricProvenance` instead — coarse inference
 * cannot distinguish direct-Oura from Oura-via-Apple-Health.
 */
function inferProvider(source?: string | null, sourceProvider?: string | null): Provider {
  const provenance = inferRowProvenance(source, sourceProvider);
  return provenanceToProvider(provenance);
}

function provenanceToProvider(p: Provenance): Provider {
  if (p === 'direct_oura') return 'oura';
  if (
    p === 'apple_health_native' ||
    p === 'oura_via_apple_health' ||
    p === 'third_party_via_apple_health'
  ) {
    return 'apple-healthkit';
  }
  return 'unknown';
}

/**
 * Resolve provenance from row-level `source` / `source_provider` labels.
 * Recognises the labels emitted by the iOS bridge
 * (`oura_via_apple_health`, `apple_watch_via_apple_health`,
 *  `<vendor>_via_apple_health`, `mixed_via_apple_health`, `apple_health`)
 * plus the direct-sync labels (`oura`, `apple-healthkit`).
 */
function inferRowProvenance(
  source?: string | null,
  sourceProvider?: string | null,
): Provenance {
  const sp = (sourceProvider ?? '').toLowerCase();
  const s = (source ?? '').toLowerCase();
  const combined = `${s} ${sp}`;

  const viaAppleHealth = combined.includes('_via_apple_health');
  if (viaAppleHealth) {
    if (combined.includes('oura')) return 'oura_via_apple_health';
    if (combined.includes('apple_watch') || combined.includes('apple_health')) {
      return 'apple_health_native';
    }
    if (combined.includes('mixed')) return 'third_party_via_apple_health';
    return 'third_party_via_apple_health';
  }

  // Non-"via_apple_health" labels: direct sync paths.
  if (sp === 'oura' || s === 'oura') return 'direct_oura';
  if (
    sp === 'apple_healthkit' || sp === 'apple-healthkit' || sp === 'apple_health' ||
    s === 'apple-healthkit' || s === 'apple_healthkit' || s === 'apple_health'
  ) {
    return 'apple_health_native';
  }
  // Legacy loose contains — last resort so we degrade gracefully instead of
  // mislabelling as `direct_oura`.
  if (combined.includes('apple')) return 'apple_health_native';
  if (combined.includes('oura')) return 'direct_oura';
  return 'unknown';
}

function isAppleWatchTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return t.includes('apple') && (t.includes('watch') || t.includes('healthkit'));
}

function rowHasAppleWatch(row: WearableRowLike): boolean {
  const apps = parseSourceApps(row.source_apps);
  for (const tags of Object.values(apps)) {
    if (tags.some(isAppleWatchTag)) return true;
  }
  // Only trust the row-level provider label when it's a *native* Apple path.
  // `oura_via_apple_health` also contains "apple" but must NOT count as Apple
  // Watch — that's the exact bug this refactor closes.
  const provenance = inferRowProvenance(row.source, row.source_provider);
  return provenance === 'apple_health_native';
}

function isPresent(value: unknown, metric: MetricKey): boolean {
  if (value == null) return false;
  if ((metric === 'hr_samples' || metric === 'hrv_samples') && Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function parseSourceApps(value: unknown): SourceApps {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SourceApps = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(raw)) {
      out[key] = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  }
  return out;
}

function providerTag(provider: Provider): string[] {
  if (provider === 'oura') return ['oura'];
  if (provider === 'apple-healthkit') return ['apple-healthkit'];
  return ['unknown'];
}

function completenessScore(provider: Provider, row: WearableRowLike): number {
  let score = 0;
  for (const metric of HRV_METRICS) {
    if (isPresent(row[metric], metric)) score += 2;
  }
  for (const metric of HEART_METRICS) {
    if (isPresent(row[metric], metric)) score += 2;
  }
  for (const metric of SLEEP_METRICS) {
    if (isPresent(row[metric], metric)) score += 1;
  }
  if (provider === 'apple-healthkit' && isPresent(row.hr_samples, 'hr_samples')) score += 2;
  if (provider === 'oura' && isPresent(row.sleep_score, 'sleep_score')) score += 2;
  return score;
}

function rowUpdatedAt(row: WearableRowLike): Date | null {
  const raw = row.updated_at ?? row.updatedAt ?? null;
  if (!raw || typeof raw !== 'string') return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function preferIncoming(
  metric: MetricKey,
  existing: WearableRowLike,
  incoming: WearableRowLike,
  ctx: WearableMergeContext,
): boolean {
  if (!isPresent(incoming[metric], metric)) return false;
  if (!isPresent(existing[metric], metric)) return true;

  const existingProvider = resolveMetricProvider(metric, existing);
  const incomingProvider = resolveMetricProvider(metric, incoming);
  const existingProvenance = resolveMetricProvenance(metric, existing);
  const incomingProvenance = resolveMetricProvenance(metric, incoming);

  // Sleep: prefer direct-Oura when a direct connection is verified;
  // otherwise Apple-native > Oura-via-Apple > third-party-via-Apple.
  if (SLEEP_METRICS.includes(metric)) {
    const iRank = sleepRank(incomingProvenance, ctx);
    const eRank = sleepRank(existingProvenance, ctx);
    if (iRank !== eRank) return iRank > eRank;
    return true;
  }

  // Live HR + hr_samples: hard-prefer Apple Watch (apple_health_native).
  // Oura-via-Apple-Health is explicitly NOT treated as Apple Watch here.
  if (HEART_METRICS.includes(metric)) {
    const incomingIsAppleNative = incomingProvenance === 'apple_health_native';
    const existingIsAppleNative = existingProvenance === 'apple_health_native';
    if (ctx.appleWatchPresentToday || incomingIsAppleNative || existingIsAppleNative) {
      if (incomingIsAppleNative && !existingIsAppleNative) return true;
      if (existingIsAppleNative && !incomingIsAppleNative) return false;
    }
    const iRank = heartRank(incomingProvenance);
    const eRank = heartRank(existingProvenance);
    if (iRank !== eRank) return iRank > eRank;
    return true;
  }

  // HRV / RHR: completeness first, freshness within 24h, then provenance rank
  // (direct_oura > apple_health_native > oura_via_apple_health > third_party).
  const incomingScore = completenessScore(incomingProvider, incoming);
  const existingScore = completenessScore(existingProvider, existing);
  if (incomingScore !== existingScore) return incomingScore > existingScore;

  const inc = rowUpdatedAt(incoming);
  const exi = rowUpdatedAt(existing);
  if (inc && exi) {
    const deltaHrs = Math.abs(inc.getTime() - exi.getTime()) / 3_600_000;
    if (deltaHrs <= 24) return inc.getTime() >= exi.getTime();
    // >24h apart: fall through to provenance preference (do not use freshness).
  }

  const iRank = hrvRank(incomingProvenance);
  const eRank = hrvRank(existingProvenance);
  if (iRank !== eRank) return iRank > eRank;
  return true;
}

/** Priority ranks for the sleep metric family. Higher = wins. */
function sleepRank(p: Provenance, ctx: WearableMergeContext): number {
  if (ctx.ouraDirectConnected) {
    // Direct Oura wins; Apple native next; Oura-via-Apple is lowest since it's
    // just a stale mirror of what direct-Oura already provides.
    switch (p) {
      case 'direct_oura': return 5;
      case 'apple_health_native': return 4;
      case 'third_party_via_apple_health': return 3;
      case 'oura_via_apple_health': return 2;
      default: return 1;
    }
  }
  // No direct Oura — Apple native is authoritative, mirrored Oura still useful.
  switch (p) {
    case 'apple_health_native': return 5;
    case 'oura_via_apple_health': return 4;
    case 'third_party_via_apple_health': return 3;
    case 'direct_oura': return 2; // shouldn't happen w/o connection, but rank low
    default: return 1;
  }
}

/**
 * Priority for live HR / hr_samples. Apple-native (Apple Watch) is the only
 * source with true per-second telemetry; direct Oura is a coarse daily/hourly
 * summary but still trusted over Oura-via-Apple-Health mirror.
 */
function heartRank(p: Provenance): number {
  switch (p) {
    case 'apple_health_native': return 5;
    case 'direct_oura': return 4;
    case 'oura_via_apple_health': return 3;
    case 'third_party_via_apple_health': return 2;
    default: return 1;
  }
}

/** Priority for HRV / RHR tiebreak once completeness + freshness are equal. */
function hrvRank(p: Provenance): number {
  switch (p) {
    case 'direct_oura': return 5;
    case 'apple_health_native': return 4;
    case 'oura_via_apple_health': return 3;
    case 'third_party_via_apple_health': return 2;
    default: return 1;
  }
}

function setMetricSource(
  apps: SourceApps,
  metric: MetricKey,
  provider: Provider,
  row: WearableRowLike,
): void {
  const rowApps = parseSourceApps(row.source_apps);
  const existing = rowApps[metric];
  apps[metric] = existing && existing.length > 0 ? existing : providerTag(provider);
}

function summarizeProvider(metricProviders: Provider[]): string | null {
  const unique = Array.from(new Set(metricProviders.filter((provider) => provider !== 'unknown')));
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return unique[0] === 'oura' ? 'oura' : 'apple_healthkit';
  }
  return 'mixed';
}

/**
 * Resolve the *explicit* provenance for a given metric on a row. Consults
 * per-metric `source_apps` tags first (finest granularity), then falls back
 * to the row-level `source_provider` / `source` label.
 *
 * The critical distinction vs. `resolveMetricProvider` (coarse) is that an
 * "oura" tag on a metric whose row-level provider is `*_via_apple_health`
 * resolves to `oura_via_apple_health`, NOT `direct_oura`.
 */
export function resolveMetricProvenance(metric: string, row: WearableRowLike): Provenance {
  const apps = parseSourceApps(row.source_apps);
  const tags = (apps[metric] ?? []).map((t) => t.toLowerCase());
  const rowProvenance = inferRowProvenance(row.source, row.source_provider);

  const tagHasOura = tags.some((t) => t.includes('oura'));
  const tagHasApple = tags.some((t) => t.includes('apple') || t === 'healthkit' || t.includes('watch'));

  if (tagHasOura) {
    // If the row itself came through HealthKit, the "oura" tag is a mirror.
    if (
      rowProvenance === 'oura_via_apple_health' ||
      rowProvenance === 'apple_health_native' ||
      rowProvenance === 'third_party_via_apple_health'
    ) {
      return 'oura_via_apple_health';
    }
    return 'direct_oura';
  }
  if (tagHasApple) return 'apple_health_native';

  return rowProvenance;
}

/** Legacy coarse resolver — retained for backward-compat callers. */
export function resolveMetricProvider(metric: string, row: WearableRowLike): Provider {
  return provenanceToProvider(resolveMetricProvenance(metric, row));
}

/**
 * True when the metric was delivered through HealthKit (Apple-native OR any
 * `*_via_apple_health` provider). Callers use this to apply the Apple-Health
 * sleep-duration dampener and other HealthKit-routed adjustments, so
 * mirrored-Oura-via-Apple must be included.
 */
export function isAppleMetricSource(metric: string, row: WearableRowLike): boolean {
  const p = resolveMetricProvenance(metric, row);
  return p === 'apple_health_native'
    || p === 'oura_via_apple_health'
    || p === 'third_party_via_apple_health';
}

/**
 * Load merge-time connection state for a given user + local date.
 * Kept as a separate helper so the sync `mergeCanonicalWearableRow` signature
 * stays unchanged (Turn 1 constraint: no consumer refactors).
 *
 * `supabase` is intentionally typed as `any` — this file must not import the
 * generated Supabase types (edge-function isolate). Callers already hold a
 * typed client.
 */
// deno-lint-ignore no-explicit-any
export async function loadWearableMergeContext(
  supabase: any,
  userId: string,
  summaryDate: string,
): Promise<WearableMergeContext> {
  const ctx: WearableMergeContext = { ...DEFAULT_MERGE_CONTEXT };
  try {
    const { data: conns } = await supabase
      .from('oura_connections')
      .select('connection_status, writes_to_apple_health')
      .eq('user_id', userId);
    if (Array.isArray(conns)) {
      for (const c of conns) {
        if ((c?.connection_status ?? '').toLowerCase() === 'connected') {
          ctx.ouraDirectConnected = true;
        }
        if (c?.writes_to_apple_health === true) {
          ctx.ouraWritesToAppleHealth = true;
        }
      }
    }
  } catch (_e) { /* connection table optional in tests */ }

  try {
    const { data: rows } = await supabase
      .from('wearable_data')
      .select('source, source_provider, source_apps')
      .eq('user_id', userId)
      .eq('summary_date', summaryDate);
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (rowHasAppleWatch(r as WearableRowLike)) {
          ctx.appleWatchPresentToday = true;
          break;
        }
      }
    }
  } catch (_e) { /* ignore */ }

  return ctx;
}

export function mergeCanonicalWearableRow(
  existingInput: WearableRowLike | null | undefined,
  incomingInput: WearableRowLike,
  options: MergeOptions = {},
): WearableRowLike {
  const existing = existingInput ?? {};
  const incoming = incomingInput;
  const ctx = options.context ?? DEFAULT_MERGE_CONTEXT;
  const guardHours = options.recencyGuardHours ?? DEFAULT_RECENCY_GUARD_HOURS;
  const onRecon = options.onReconciliation;

  const merged: WearableRowLike = {
    ...existing,
    ...incoming,
  };
  const mergedApps: SourceApps = {
    ...parseSourceApps(existing.source_apps),
    ...parseSourceApps(incoming.source_apps),
  };
  const chosenProviders: Provider[] = [];
  const metrics: MetricKey[] = [
    'hrv',
    'hrv_samples',
    'resting_heart_rate',
    'heart_rate',
    'hr_samples',
    'total_sleep_minutes',
    'deep_sleep_minutes',
    'rem_sleep_minutes',
    'sleep_score',
    'sleep_efficiency',
  ];

  const incUpdated = rowUpdatedAt(incoming);
  const exiUpdated = rowUpdatedAt(existing);

  for (const metric of metrics) {
    let useIncoming = preferIncoming(metric, existing, incoming, ctx);

    // Recency guard: if we would overwrite an existing value with a losing
    // source's write that is more than `guardHours` newer than the current
    // winner, block the overwrite and emit a reconciliation record.
    if (
      useIncoming &&
      isPresent(existing[metric], metric) &&
      incUpdated && exiUpdated
    ) {
      const existingProvider = resolveMetricProvider(metric, existing);
      const incomingProvider = resolveMetricProvider(metric, incoming);
      const incomingScore = completenessScore(incomingProvider, incoming);
      const existingScore = completenessScore(existingProvider, existing);
      // Guard fires when incoming would win but has no true authority
      // advantage — the only reason it's about to overwrite is that it's
      // newer. Cross-source only (same-source updates always land).
      const crossSource =
        incomingProvider !== 'unknown' &&
        existingProvider !== 'unknown' &&
        incomingProvider !== existingProvider;
      const incomingIsLosingSource =
        crossSource &&
        (
          (HRV_METRICS.includes(metric) && incomingScore <= existingScore) ||
          (SLEEP_METRICS.includes(metric) && ctx.ouraDirectConnected && incomingProvider !== 'oura' && existingProvider === 'oura') ||
          (HEART_METRICS.includes(metric) && !rowHasAppleWatch(incoming) && rowHasAppleWatch(existing))
        );

      const deltaHrs = (incUpdated.getTime() - exiUpdated.getTime()) / 3_600_000;
      if (incomingIsLosingSource && deltaHrs > guardHours) {
        useIncoming = false;
        onRecon?.({
          metric,
          winning_source: (existing.source_provider as string | null) ?? (existing.source as string | null) ?? null,
          losing_source: (incoming.source_provider as string | null) ?? (incoming.source as string | null) ?? null,
          winning_updated_at: exiUpdated.toISOString(),
          losing_updated_at: incUpdated.toISOString(),
          delta_hours: Number(deltaHrs.toFixed(2)),
          reason: 'recency_guard_blocked_overwrite',
          details: {
            guard_hours: guardHours,
            incoming_provider: incomingProvider,
            existing_provider: existingProvider,
            incoming_completeness: incomingScore,
            existing_completeness: existingScore,
          },
        });
      }
    }

    const chosenRow = useIncoming ? incoming : existing;
    const provider = resolveMetricProvider(metric, chosenRow);
    chosenProviders.push(provider);
    if (isPresent(chosenRow[metric], metric)) {
      merged[metric] = chosenRow[metric];
      setMetricSource(mergedApps, metric, provider, chosenRow);
    }
  }

  merged.source_apps = mergedApps;
  merged.source_provider = summarizeProvider(chosenProviders);

  const sleepProvider = resolveMetricProvider('total_sleep_minutes', merged);
  const fallbackProvider = inferProvider(incoming.source, incoming.source_provider);
  merged.source = sleepProvider === 'unknown' ? fallbackProvider : sleepProvider;

  return merged;
}
