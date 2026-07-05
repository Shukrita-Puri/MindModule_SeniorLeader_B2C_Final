type Provider = 'oura' | 'apple-healthkit' | 'unknown';

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

function inferProvider(source?: string | null, sourceProvider?: string | null): Provider {
  const combined = `${source ?? ''} ${sourceProvider ?? ''}`.toLowerCase();
  if (combined.includes('oura')) return 'oura';
  if (combined.includes('apple')) return 'apple-healthkit';
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
  const combined = `${row.source ?? ''} ${row.source_provider ?? ''}`.toLowerCase();
  return combined.includes('apple');
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

  // Sleep: direct Oura preferred if connected, else Apple Health.
  if (SLEEP_METRICS.includes(metric)) {
    if (ctx.ouraDirectConnected) {
      if (incomingProvider === 'oura' && existingProvider !== 'oura') return true;
      if (existingProvider === 'oura' && incomingProvider !== 'oura') return false;
    } else {
      // No direct Oura connection — an "oura"-tagged row is almost certainly
      // mirrored via Apple Health anyway; treat Apple Health as authoritative.
      if (incomingProvider === 'apple-healthkit' && existingProvider !== 'apple-healthkit') return true;
      if (existingProvider === 'apple-healthkit' && incomingProvider !== 'apple-healthkit') return false;
    }
    return true;
  }

  // Current/live HR + hr_samples: hard-prefer Apple Watch when any Apple
  // Watch data exists for that day.
  if (HEART_METRICS.includes(metric)) {
    const incomingIsAppleWatch = rowHasAppleWatch(incoming);
    const existingIsAppleWatch = rowHasAppleWatch(existing);
    if (ctx.appleWatchPresentToday || incomingIsAppleWatch || existingIsAppleWatch) {
      if (incomingIsAppleWatch && !existingIsAppleWatch) return true;
      if (existingIsAppleWatch && !incomingIsAppleWatch) return false;
    }
    // Fall through to Apple-Healthkit preference / completeness.
    if (incomingProvider === 'apple-healthkit' && existingProvider !== 'apple-healthkit') return true;
    if (existingProvider === 'apple-healthkit' && incomingProvider !== 'apple-healthkit') return false;
    return true;
  }

  // HRV / RHR: completeness first, freshness as tiebreaker within 24h only.
  const incomingScore = completenessScore(incomingProvider, incoming);
  const existingScore = completenessScore(existingProvider, existing);
  if (incomingScore !== existingScore) return incomingScore > existingScore;

  const inc = rowUpdatedAt(incoming);
  const exi = rowUpdatedAt(existing);
  if (inc && exi) {
    const deltaHrs = Math.abs(inc.getTime() - exi.getTime()) / 3_600_000;
    if (deltaHrs <= 24) return inc.getTime() >= exi.getTime();
    // >24h apart: fall through to provider preference (do not use freshness).
  }

  if (incomingProvider !== existingProvider) {
    if (incomingProvider === 'apple-healthkit') return true;
    if (existingProvider === 'apple-healthkit') return false;
  }
  return true;
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

export function resolveMetricProvider(metric: string, row: WearableRowLike): Provider {
  const apps = parseSourceApps(row.source_apps);
  const tags = apps[metric] ?? [];
  if (tags.some((tag) => tag.toLowerCase().includes('oura'))) return 'oura';
  if (tags.some((tag) => tag.toLowerCase().includes('apple'))) return 'apple-healthkit';
  return inferProvider(row.source, row.source_provider);
}

export function isAppleMetricSource(metric: string, row: WearableRowLike): boolean {
  return resolveMetricProvider(metric, row) === 'apple-healthkit';
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
      // Only guard cross-source overwrites where the LOSING (by rules)
      // source is winning purely by being newer.
      // preferIncoming already returned true — check whether without the
      // freshness edge, existing would have won: i.e. incoming has lower
      // completeness or lower priority provider.
      const incomingScore = completenessScore(incomingProvider, incoming);
      const existingScore = completenessScore(existingProvider, existing);
      const incomingIsLosingSource =
        (SLEEP_METRICS.includes(metric) && ctx.ouraDirectConnected && incomingProvider !== 'oura' && existingProvider === 'oura') ||
        (HEART_METRICS.includes(metric) && !rowHasAppleWatch(incoming) && rowHasAppleWatch(existing)) ||
        (HRV_METRICS.includes(metric) && incomingScore < existingScore);

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
