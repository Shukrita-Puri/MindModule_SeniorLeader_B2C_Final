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

function preferIncoming(metric: MetricKey, existing: WearableRowLike, incoming: WearableRowLike): boolean {
  if (!isPresent(incoming[metric], metric)) return false;
  if (!isPresent(existing[metric], metric)) return true;

  const existingProvider = inferProvider(existing.source, existing.source_provider);
  const incomingProvider = inferProvider(incoming.source, incoming.source_provider);

  if (SLEEP_METRICS.includes(metric)) {
    if (incomingProvider === 'oura' && existingProvider !== 'oura') return true;
    if (existingProvider === 'oura' && incomingProvider !== 'oura') return false;
    return true;
  }

  if (HEART_METRICS.includes(metric)) {
    if (incomingProvider === 'apple-healthkit' && existingProvider !== 'apple-healthkit') return true;
    if (existingProvider === 'apple-healthkit' && incomingProvider !== 'apple-healthkit') return false;
    return true;
  }

  const incomingScore = completenessScore(incomingProvider, incoming);
  const existingScore = completenessScore(existingProvider, existing);
  if (incomingScore !== existingScore) return incomingScore > existingScore;
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

export function mergeCanonicalWearableRow(
  existingInput: WearableRowLike | null | undefined,
  incomingInput: WearableRowLike,
): WearableRowLike {
  const existing = existingInput ?? {};
  const incoming = incomingInput;
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

  for (const metric of metrics) {
    const useIncoming = preferIncoming(metric, existing, incoming);
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
