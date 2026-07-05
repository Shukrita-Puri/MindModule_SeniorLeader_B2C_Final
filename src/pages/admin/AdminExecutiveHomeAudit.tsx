import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';

type TimeWindow = 'morning' | 'afternoon' | 'evening';
type SkipReason =
  | 'job_disabled'
  | 'not_due_now'
  | 'window_filter_mismatch'
  | 'already_attempted_for_window'
  | 'max_users_per_run_reached'
  | 'onboarding_missing';

interface Eligibility {
  eligible: boolean;
  window: TimeWindow | null;
  reason: SkipReason | null;
}

interface AuditUserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  onboardingCompletedAt: string | null;
  currentTimezone: string | null;
  homeTimezone: string | null;
  effectiveTimezone: string;
  isAway: boolean;
  localDate: string;
  localHour: number;
  localMinute: number;
  dueWindow: TimeWindow | null;
  eligibility: Eligibility;
  lastRun: {
    createdAt: string | null;
    status: string | null;
    mode: string | null;
    window: string | null;
    localDate: string | null;
    skippedReason: string | null;
    error: string | null;
  } | null;
  everProcessed: boolean;
}

interface AuditSummary {
  totalOnboardedUsers: number;
  dueNow: number;
  skippedNow: number;
  recentSuccessUsers24h: number;
  recentErrorUsers24h: number;
  neverProcessedUsers: number;
  skipReasonCounts: Record<string, number>;
}

interface AuditListResp {
  now: string;
  configPresent: boolean;
  config: {
    enabled: boolean;
    dispatcherIntervalMinutes: number;
    maxUsersPerRun: number;
    timezoneMode: string;
    configJson: {
      windows: Record<TimeWindow, string>;
      runOnWeekends: boolean;
      respectTravelTimezone: boolean;
      dryRun?: boolean;
    };
  };
  summary: AuditSummary;
  users: AuditUserRow[];
  totalUnfiltered: number;
}

interface AuditUserDetail {
  now: string;
  configPresent: boolean;
  user: AuditUserRow & { alreadyAttemptedForCurrentWindow: boolean };
  recentRuns: Array<Record<string, unknown>>;
  latestMrsSnapshot: Record<string, unknown> | null;
  latestBriefSnapshot: Record<string, unknown> | null;
  latestMasteryPlanSnapshot: Record<string, unknown> | null;
}

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  job_disabled: 'Job disabled in admin_cron_job_configs',
  not_due_now: 'Not inside any due window right now',
  window_filter_mismatch: 'Due window differs from requested filter',
  already_attempted_for_window: 'Scheduled attempt already claimed for this window today',
  max_users_per_run_reached: 'Dispatcher batch cap reached this tick',
  onboarding_missing: 'profiles.onboarding_completed_at IS NULL',
};

const fmt = (v: unknown) => (v == null ? '—' : String(v));
const fmtTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString() : '—';

async function callAudit(params: Record<string, string>) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/admin-executive-home-audit${qs ? `?${qs}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

async function invokeRunJob(payload: Record<string, unknown>) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  // Reuse the single writer entry-point that admin-jobs-summary already
  // exposes. We deliberately do NOT re-implement dry-run / replay here.
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/admin-jobs-summary`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_job', ...payload }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

const Section = ({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2 flex flex-row items-center justify-between">
      <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
        {title}
      </CardTitle>
      {extra}
    </CardHeader>
    <CardContent className="text-sm">{children}</CardContent>
  </Card>
);

const SummaryTile = ({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'err' }) => (
  <div className={`rounded-md border p-3 ${tone === 'err' ? 'border-destructive/40 bg-destructive/5' : tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/30'}`}>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-xl font-semibold mt-1">{value}</div>
  </div>
);

const EligibilityBadge = ({ e }: { e: Eligibility }) => {
  if (e.eligible) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Eligible now</Badge>;
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      Skipped · {e.reason ?? 'unknown'}
    </Badge>
  );
};

const AdminExecutiveHomeAudit = () => {
  const [data, setData] = useState<AuditListResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [eligibility, setEligibility] = useState<'' | 'eligible' | 'skipped'>('');
  const [windowFilter, setWindowFilter] = useState<'' | TimeWindow>('');
  const [skipReasonFilter, setSkipReasonFilter] = useState<'' | SkipReason>('');

  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AuditUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      if (eligibility) params.eligibility = eligibility;
      if (windowFilter) params.window = windowFilter;
      if (skipReasonFilter) params.skipReason = skipReasonFilter;
      const body = (await callAudit(params)) as AuditListResp;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [query, eligibility, windowFilter, skipReasonFilter]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);

  const loadUserDetail = useCallback(async (userId: string) => {
    setUserDetailLoading(true);
    try {
      const body = (await callAudit({ userId })) as AuditUserDetail;
      setUserDetail(body);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load user audit');
    } finally {
      setUserDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserDetail(null);
      return;
    }
    void loadUserDetail(selectedUserId);
  }, [selectedUserId, loadUserDetail]);

  const runDryRun = async () => {
    setDryRunning(true);
    setDryRunResult(null);
    try {
      const body = await invokeRunJob({ dryRun: true });
      setDryRunResult(body?.result ?? body);
      toast.success('Dry run complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setDryRunning(false);
    }
  };

  const replayUser = async (userId: string, window?: TimeWindow | null) => {
    setReplaying(true);
    try {
      await invokeRunJob({ userId, ...(window ? { window } : {}) });
      toast.success('Replay dispatched');
      await loadUserDetail(userId);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setReplaying(false);
    }
  };

  const cfg = data?.config;
  const skipReasonOptions = useMemo<SkipReason[]>(
    () => [
      'not_due_now',
      'job_disabled',
      'already_attempted_for_window',
      'window_filter_mismatch',
      'max_users_per_run_reached',
      'onboarding_missing',
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Executive Home Cards · Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Job key <code className="font-mono">executive_home_cards</code> · function{' '}
            <code className="font-mono">build-executive-home-cards</code>. Rules read from{' '}
            <code className="font-mono">admin_cron_job_configs</code>.
          </p>
        </div>
        <Button onClick={runDryRun} disabled={dryRunning}>
          {dryRunning ? 'Running…' : 'Run audit (dry run)'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Config block — sourced from admin_cron_job_configs via scheduler.ts */}
      <Section
        title="Runtime rules (from code + admin_cron_job_configs)"
        extra={
          <Badge variant={data?.configPresent ? 'default' : 'secondary'}>
            {data?.configPresent ? 'config row present' : 'using defaults (row missing)'}
          </Badge>
        }
      >
        {cfg ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <li>
              <span className="text-muted-foreground">Enabled:</span>{' '}
              <Badge variant={cfg.enabled ? 'default' : 'destructive'}>{String(cfg.enabled)}</Badge>
            </li>
            <li>
              <span className="text-muted-foreground">Timezone mode:</span> {cfg.timezoneMode}
            </li>
            <li>
              <span className="text-muted-foreground">Dispatcher interval:</span>{' '}
              {cfg.dispatcherIntervalMinutes} min
            </li>
            <li>
              <span className="text-muted-foreground">Max users / run:</span> {cfg.maxUsersPerRun}
            </li>
            <li>
              <span className="text-muted-foreground">Windows:</span>{' '}
              morning {cfg.configJson.windows.morning} · afternoon {cfg.configJson.windows.afternoon}{' '}
              · evening {cfg.configJson.windows.evening}
            </li>
            <li>
              <span className="text-muted-foreground">Weekends:</span>{' '}
              {cfg.configJson.runOnWeekends ? 'allowed' : 'blocked'}
            </li>
            <li>
              <span className="text-muted-foreground">Respect travel timezone:</span>{' '}
              {String(cfg.configJson.respectTravelTimezone)}
            </li>
            <li>
              <span className="text-muted-foreground">Only onboarded users:</span> yes (
              <code>onboarding_completed_at IS NOT NULL</code>)
            </li>
            <li className="md:col-span-2">
              <span className="text-muted-foreground">Per-window dedupe:</span> one{' '}
              <code>mode=scheduled</code> row per (user, local_date, window) is claimed atomically
              via a partial unique index; further scheduled attempts return{' '}
              <code>already_attempted_for_window</code>.
            </li>
          </ul>
        ) : (
          <p className="text-muted-foreground">Missing config.</p>
        )}
      </Section>

      {/* Summary tiles */}
      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SummaryTile label="Onboarded users" value={data.summary.totalOnboardedUsers} />
          <SummaryTile label="Due now" value={data.summary.dueNow} />
          <SummaryTile label="Skipped now" value={data.summary.skippedNow} tone="warn" />
          <SummaryTile label="Success (24h)" value={data.summary.recentSuccessUsers24h} tone="ok" />
          <SummaryTile
            label="Errored (24h)"
            value={data.summary.recentErrorUsers24h}
            tone={data.summary.recentErrorUsers24h > 0 ? 'err' : undefined}
          />
          <SummaryTile label="Never processed" value={data.summary.neverProcessedUsers} tone="warn" />
        </div>
      )}

      {/* Dry-run result */}
      {dryRunResult && (
        <Section title="Dry-run result">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
            <div>
              <span className="text-muted-foreground">Due users:</span>{' '}
              {dryRunResult.dueUsers ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Skipped users:</span>{' '}
              {dryRunResult.skippedUsers ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Next expected run:</span>{' '}
              {fmtTime(dryRunResult.nextExpectedRun)}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Raw payload</summary>
            <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-auto">
              {JSON.stringify(dryRunResult, null, 2)}
            </pre>
          </details>
        </Section>
      )}

      {/* Filters */}
      <Section title="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Search by email, name, or user id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={eligibility}
            onChange={(e) => setEligibility(e.target.value as any)}
          >
            <option value="">All statuses</option>
            <option value="eligible">Eligible now</option>
            <option value="skipped">Skipped now</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={windowFilter}
            onChange={(e) => setWindowFilter(e.target.value as any)}
          >
            <option value="">All windows</option>
            <option value="morning">morning</option>
            <option value="afternoon">afternoon</option>
            <option value="evening">evening</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={skipReasonFilter}
            onChange={(e) => setSkipReasonFilter(e.target.value as any)}
          >
            <option value="">All skip reasons</option>
            {skipReasonOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </Section>

      {/* User list */}
      <Section
        title={`Onboarded users (${data?.users.length ?? 0} of ${data?.totalUnfiltered ?? 0})`}
      >
        {loading && !data ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Timezone</th>
                  <th className="py-2 pr-3">Local time</th>
                  <th className="py-2 pr-3">Due window</th>
                  <th className="py-2 pr-3">Eligibility</th>
                  <th className="py-2 pr-3">Last run</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((row) => (
                  <tr key={row.userId} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{row.email ?? row.fullName ?? row.userId}</div>
                      <div className="text-muted-foreground font-mono text-[10px]">{row.userId}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{row.effectiveTimezone}</div>
                      <div className="text-muted-foreground">
                        {row.isAway ? 'away · ' : ''}home {row.homeTimezone ?? '—'}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {row.localDate}{' '}
                      {String(row.localHour).padStart(2, '0')}:
                      {String(row.localMinute).padStart(2, '0')}
                    </td>
                    <td className="py-2 pr-3">{row.dueWindow ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <EligibilityBadge e={row.eligibility} />
                    </td>
                    <td className="py-2 pr-3">
                      {row.lastRun ? (
                        <div>
                          <div>{fmtTime(row.lastRun.createdAt)}</div>
                          <div className="text-muted-foreground">
                            {row.lastRun.status ?? '—'} · {row.lastRun.mode ?? '—'} ·{' '}
                            {row.lastRun.window ?? '—'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">missing data</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUserId(row.userId)}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
                {(data?.users ?? []).length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      No users match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Per-user drill-down */}
      {selectedUserId && (
        <Section
          title={`User audit · ${selectedUserId}`}
          extra={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={replaying}
                onClick={() => replayUser(selectedUserId, userDetail?.user.dueWindow ?? undefined)}
              >
                {replaying ? 'Replaying…' : 'Replay now'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUserId(null)}>
                Close
              </Button>
            </div>
          }
        >
          {userDetailLoading || !userDetail ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Email</div>
                  <div>{fmt(userDetail.user.email)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Onboarded at</div>
                  <div>{fmtTime(userDetail.user.onboardingCompletedAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Effective timezone</div>
                  <div className="font-mono">{userDetail.user.effectiveTimezone}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Current local time</div>
                  <div className="font-mono">
                    {userDetail.user.localDate}{' '}
                    {String(userDetail.user.localHour).padStart(2, '0')}:
                    {String(userDetail.user.localMinute).padStart(2, '0')}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Due window</div>
                  <div>{userDetail.user.dueWindow ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Eligibility</div>
                  <div className="mt-1">
                    <EligibilityBadge e={userDetail.user.eligibility} />
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 bg-muted/30">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Why this user did {userDetail.user.eligibility.eligible ? '' : 'not '}run
                </div>
                {userDetail.user.eligibility.eligible ? (
                  <p className="text-sm">
                    User is inside the <code>{userDetail.user.eligibility.window}</code> due window
                    for <code>{userDetail.user.effectiveTimezone}</code>, no scheduled attempt has
                    been claimed for this window today, and the job is enabled. The next scheduled
                    tick will pick them up.
                  </p>
                ) : (
                  <p className="text-sm">
                    {SKIP_REASON_LABEL[userDetail.user.eligibility.reason ?? 'not_due_now']}.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Last 10 runs (executive_home_card_runs)
                </div>
                {userDetail.recentRuns.length === 0 ? (
                  <p className="text-muted-foreground text-sm">missing data</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground text-left">
                        <tr>
                          <th className="py-1 pr-3">Created</th>
                          <th className="py-1 pr-3">Mode</th>
                          <th className="py-1 pr-3">Window</th>
                          <th className="py-1 pr-3">Local date</th>
                          <th className="py-1 pr-3">Status</th>
                          <th className="py-1 pr-3">MRS</th>
                          <th className="py-1 pr-3">Brief</th>
                          <th className="py-1 pr-3">Plan</th>
                          <th className="py-1 pr-3">Duration</th>
                          <th className="py-1 pr-3">Skip / error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetail.recentRuns.map((r: any) => (
                          <tr key={r.id as string} className="border-t border-border/60">
                            <td className="py-1 pr-3">{fmtTime(r.created_at as string)}</td>
                            <td className="py-1 pr-3">{fmt(r.mode)}</td>
                            <td className="py-1 pr-3">{fmt(r.window)}</td>
                            <td className="py-1 pr-3 font-mono">{fmt(r.local_date)}</td>
                            <td className="py-1 pr-3">{fmt(r.status)}</td>
                            <td className="py-1 pr-3">{fmt(r.mrs_status)}</td>
                            <td className="py-1 pr-3">{fmt(r.brief_status)}</td>
                            <td className="py-1 pr-3">{fmt(r.plan_status)}</td>
                            <td className="py-1 pr-3">{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</td>
                            <td className="py-1 pr-3 max-w-[24ch] truncate" title={String(r.error ?? r.skipped_reason ?? '')}>
                              {fmt(r.skipped_reason ?? r.error)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Latest MRS snapshot (daily_context_snapshot)
                  </div>
                  {userDetail.latestMrsSnapshot ? (
                    <pre className="text-[10px] max-h-40 overflow-auto">
                      {JSON.stringify(userDetail.latestMrsSnapshot, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">missing data</p>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Latest brief snapshot
                  </div>
                  {userDetail.latestBriefSnapshot ? (
                    <pre className="text-[10px] max-h-40 overflow-auto">
                      {JSON.stringify(userDetail.latestBriefSnapshot, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">missing data</p>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Latest mastery plan snapshot
                  </div>
                  {userDetail.latestMasteryPlanSnapshot ? (
                    <pre className="text-[10px] max-h-40 overflow-auto">
                      {JSON.stringify(userDetail.latestMasteryPlanSnapshot, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">missing data</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
};

export default AdminExecutiveHomeAudit;