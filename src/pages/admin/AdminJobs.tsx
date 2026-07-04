import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';

type RunRow = Record<string, unknown>;

interface JobConfig {
  enabled: boolean;
  dispatcherIntervalMinutes: number;
  maxUsersPerRun: number;
  retryAttempts: number;
  retryDelaySeconds: number;
  configJson: {
    windows: { morning: string; afternoon: string; evening: string };
    runOnWeekends: boolean;
    respectTravelTimezone: boolean;
    dryRun?: boolean;
  };
}

interface JobSummary {
  jobKey: string;
  jobName: string;
  functionName: string;
  enabled: boolean;
  scheduleType: string;
  cronExpression: string | null;
  dispatcherIntervalMinutes: number | null;
  lastRunTime: string | null;
  lastSuccessTime: string | null;
  lastFailureTime: string | null;
  nextExpectedRun: string | null;
  currentStatus: string;
  totalRunsToday: number | null;
  failedRunsToday: number | null;
  averageDurationMs: number | null;
  lastErrorMessage: string | null;
  editable: boolean;
  config: JobConfig | null;
}

interface JobsResp {
  summary?: {
    totalRunningJobs?: number;
    successfulJobs24h?: number;
    failedJobs24h?: number;
    lastExecutiveHomeBuildAt?: string | null;
    lastNotificationJobAt?: string | null;
  };
  counts?: { running?: number; failed24h?: number; success24h?: number };
  jobs?: JobSummary[];
  recentRuns?: RunRow[];
  sources?: Array<{ name: string; available: boolean; reason?: string }>;
  configs?: PersistedCronConfig[];
}

interface PersistedCronConfig {
  jobKey: string;
  jobName: string;
  description: string | null;
  enabled: boolean;
  scheduleCron: string | null;
  timezone: string;
  runWindows: unknown[];
  config: Record<string, unknown>;
  updatedAt: string | null;
  lastUpdatedByEmail: string | null;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

const AdminJobs = () => {
  const [data, setData] = useState<JobsResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [localDateFilter, setLocalDateFilter] = useState('');
  const [windowFilter, setWindowFilter] = useState('');
  const [runUserId, setRunUserId] = useState('');
  const [runLocalDate, setRunLocalDate] = useState('');
  const [runWindow, setRunWindow] = useState('');
  const [form, setForm] = useState({
    enabled: true,
    dryRun: false,
    morning: '05:00',
    afternoon: '12:00',
    evening: '18:00',
    maxUsersPerRun: '100',
    retryAttempts: '2',
    retryDelaySeconds: '30',
    dispatcherIntervalMinutes: '5',
    runOnWeekends: true,
    respectTravelTimezone: true,
  });

  const executiveJob = useMemo(
    () => (data?.jobs ?? []).find((job) => job.jobKey === 'executive_home_cards') ?? null,
    [data],
  );
  const notificationJob = useMemo(
    () => (data?.jobs ?? []).find((job) => job.jobKey === 'notifications' || job.jobKey === 'notification_evaluator') ?? null,
    [data],
  );
  const persistedConfigs = data?.configs ?? [];
  const configPersistenceAvailable = persistedConfigs.length > 0;

  const toggleNotificationEnabled = async (nextEnabled: boolean) => {
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-update-cron-job-config`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobKey: 'notification_evaluator', enabled: nextEnabled }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success(`Notification Evaluator ${nextEnabled ? 'enabled' : 'disabled'}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update notification job');
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (userIdFilter) params.set('userId', userIdFilter);
      if (localDateFilter) params.set('localDate', localDateFilter);
      if (windowFilter) params.set('window', windowFilter);
      const query = params.toString();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-jobs-summary${query ? `?${query}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
        throw new Error(`admin-jobs-summary · ${detail}`);
      }
      setData(body as JobsResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, userIdFilter, localDateFilter, windowFilter]);

  useEffect(() => {
    if (!executiveJob?.config) return;
    setForm({
      enabled: executiveJob.enabled,
      dryRun: executiveJob.config.configJson.dryRun === true,
      morning: executiveJob.config.configJson.windows.morning,
      afternoon: executiveJob.config.configJson.windows.afternoon,
      evening: executiveJob.config.configJson.windows.evening,
      maxUsersPerRun: String(executiveJob.config.maxUsersPerRun),
      retryAttempts: String(executiveJob.config.retryAttempts),
      retryDelaySeconds: String(executiveJob.config.retryDelaySeconds),
      dispatcherIntervalMinutes: String(executiveJob.config.dispatcherIntervalMinutes),
      runOnWeekends: executiveJob.config.configJson.runOnWeekends,
      respectTravelTimezone: executiveJob.config.configJson.respectTravelTimezone,
    });
  }, [executiveJob]);

  const postAction = async (payload: Record<string, unknown>) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/admin-jobs-summary`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? body?.details?.[0] ?? `HTTP ${res.status}`);
    return body;
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await postAction({
        action: 'update_config',
        enabled: form.enabled,
        dryRun: form.dryRun,
        morning: form.morning,
        afternoon: form.afternoon,
        evening: form.evening,
        maxUsersPerRun: Number(form.maxUsersPerRun),
        retryAttempts: Number(form.retryAttempts),
        retryDelaySeconds: Number(form.retryDelaySeconds),
        dispatcherIntervalMinutes: Number(form.dispatcherIntervalMinutes),
        runOnWeekends: form.runOnWeekends,
        respectTravelTimezone: form.respectTravelTimezone,
      });
      toast.success('Cron config updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save config');
    } finally {
      setSaving(false);
    }
  };

  const runJob = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const resp = await postAction({
        action: 'run_job',
        dryRun,
        userId: runUserId.trim() || undefined,
        localDate: runLocalDate.trim() || undefined,
        window: runWindow || undefined,
      });
      toast.success(dryRun ? 'Dry run completed' : 'Job trigger completed');
      await load();
      console.log('[AdminJobs] run response', resp);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not trigger job');
    } finally {
      setRunning(false);
    }
  };

  const copyError = async (value: unknown) => {
    const text = String(value ?? '');
    await navigator.clipboard.writeText(text);
    toast.success('Copied error');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Cron Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Dispatcher config, recent job history, and manual controls for Executive Home card generation.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading jobs…</p>}
      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Admin API error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-mono text-xs text-destructive break-all">{error}</p>
            <p className="text-muted-foreground text-xs">
              Check Edge Function deployment, CORS, auth, and optional job table availability.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && (() => {
        const jobs = data.jobs ?? [];
        const recentRuns = data.recentRuns ?? [];
        const sources = data.sources ?? [];
        const runningCount = data.summary?.totalRunningJobs ?? data.counts?.running ?? 0;
        const failed24h = data.summary?.failedJobs24h ?? data.counts?.failed24h ?? 0;
        const success24h = data.summary?.successfulJobs24h ?? data.counts?.success24h ?? 0;
        return (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['Running', runningCount],
              ['Failed (24h)', failed24h],
              ['Successful (24h)', success24h],
            ].map(([label, n]) => (
              <Card key={label as string}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</CardTitle>
                </CardHeader>
                <CardContent><div className="text-3xl font-semibold tabular-nums">{Number(n ?? 0).toLocaleString()}</div></CardContent>
              </Card>
            ))}
          </div>

          {sources.length > 0 && sources.some((s) => !s.available) && (
            <Card className="border-amber-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Source availability</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                {sources.map((s) => (
                  <div key={s.name} className="flex justify-between gap-4">
                    <span className="font-mono">{s.name}</span>
                    <span className={s.available ? 'text-muted-foreground' : 'text-amber-600'}>
                      {s.available ? 'available' : `unavailable${s.reason ? ` · ${s.reason}` : ''}`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Registry</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs configured yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Job</th>
                        <th className="py-2 pr-3">Function</th>
                        <th className="py-2 pr-3">Enabled</th>
                        <th className="py-2 pr-3">Schedule</th>
                        <th className="py-2 pr-3">Last run</th>
                        <th className="py-2 pr-3">Next expected</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Failed today</th>
                        <th className="py-2 pr-3">Last error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.jobKey} className="border-t border-border/40 align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{job.jobName}</div>
                            <div className="font-mono text-muted-foreground">{job.jobKey}</div>
                          </td>
                          <td className="py-2 pr-3 font-mono">{job.functionName}</td>
                          <td className="py-2 pr-3">{job.enabled ? 'Yes' : 'No'}</td>
                          <td className="py-2 pr-3">
                            {job.scheduleType}
                            {job.dispatcherIntervalMinutes ? ` · ${job.dispatcherIntervalMinutes} min` : ''}
                          </td>
                          <td className="py-2 pr-3">{fmt(job.lastRunTime)}</td>
                          <td className="py-2 pr-3">{fmt(job.nextExpectedRun)}</td>
                          <td className="py-2 pr-3">{job.currentStatus}</td>
                          <td className="py-2 pr-3">{job.failedRunsToday ?? '—'}</td>
                          <td className="py-2 pr-3 text-destructive truncate max-w-[28ch]" title={job.lastErrorMessage ?? ''}>
                            {job.lastErrorMessage ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persisted Cron Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!configPersistenceAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Cron config persistence is not available yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Job</th>
                        <th className="py-2 pr-3">Enabled</th>
                        <th className="py-2 pr-3">Cron</th>
                        <th className="py-2 pr-3">Timezone</th>
                        <th className="py-2 pr-3">Windows</th>
                        <th className="py-2 pr-3">Updated</th>
                        <th className="py-2 pr-3">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {persistedConfigs.map((cfg) => (
                        <tr key={cfg.jobKey} className="border-t border-border/40 align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{cfg.jobName}</div>
                            {cfg.description && (
                              <div className="text-muted-foreground max-w-[36ch]">{cfg.description}</div>
                            )}
                          </td>
                          <td className="py-2 pr-3">{cfg.enabled ? 'Yes' : 'No'}</td>
                          <td className="py-2 pr-3 font-mono">{cfg.scheduleCron ?? '—'}</td>
                          <td className="py-2 pr-3">{cfg.timezone}</td>
                          <td className="py-2 pr-3 font-mono">
                            {Array.isArray(cfg.runWindows) && cfg.runWindows.length > 0
                              ? cfg.runWindows.join(', ')
                              : '—'}
                          </td>
                          <td className="py-2 pr-3">{fmt(cfg.updatedAt)}</td>
                          <td className="py-2 pr-3">{cfg.lastUpdatedByEmail ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {notificationJob && (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">Notification Evaluator</div>
                    <div className="text-xs text-muted-foreground">
                      Pauses smart-nudges scheduled runs. Force-user diagnostics still work.
                    </div>
                  </div>
                  <Switch
                    checked={notificationJob.enabled}
                    onCheckedChange={(checked) => void toggleNotificationEnabled(checked)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Executive Home Cron Config</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-2 text-sm">
                    <span>Morning</span>
                    <Input value={form.morning} onChange={(e) => setForm((s) => ({ ...s, morning: e.target.value }))} placeholder="05:00" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Afternoon</span>
                    <Input value={form.afternoon} onChange={(e) => setForm((s) => ({ ...s, afternoon: e.target.value }))} placeholder="12:00" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Evening</span>
                    <Input value={form.evening} onChange={(e) => setForm((s) => ({ ...s, evening: e.target.value }))} placeholder="18:00" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Dispatcher interval (min)</span>
                    <Input value={form.dispatcherIntervalMinutes} onChange={(e) => setForm((s) => ({ ...s, dispatcherIntervalMinutes: e.target.value }))} />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Max users per run</span>
                    <Input value={form.maxUsersPerRun} onChange={(e) => setForm((s) => ({ ...s, maxUsersPerRun: e.target.value }))} />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Retry attempts</span>
                    <Input value={form.retryAttempts} onChange={(e) => setForm((s) => ({ ...s, retryAttempts: e.target.value }))} />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Retry delay (sec)</span>
                    <Input value={form.retryDelaySeconds} onChange={(e) => setForm((s) => ({ ...s, retryDelaySeconds: e.target.value }))} />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>Enabled</span>
                    <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((s) => ({ ...s, enabled: checked }))} />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>Run on weekends</span>
                    <Switch checked={form.runOnWeekends} onCheckedChange={(checked) => setForm((s) => ({ ...s, runOnWeekends: checked }))} />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>Respect travel timezone</span>
                    <Switch checked={form.respectTravelTimezone} onCheckedChange={(checked) => setForm((s) => ({ ...s, respectTravelTimezone: checked }))} />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>Dry-run mode</span>
                    <Switch checked={form.dryRun} onCheckedChange={(checked) => setForm((s) => ({ ...s, dryRun: checked }))} />
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveConfig} disabled={saving}>
                    {saving ? 'Saving…' : 'Save rule'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Run Now / Dry Run</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-2 text-sm">
                    <span>User ID (optional)</span>
                    <Input value={runUserId} onChange={(e) => setRunUserId(e.target.value)} placeholder="auth0|..., linkedin|..." />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Local date (optional)</span>
                    <Input value={runLocalDate} onChange={(e) => setRunLocalDate(e.target.value)} placeholder="2026-07-05" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>Window (optional)</span>
                    <Input value={runWindow} onChange={(e) => setRunWindow(e.target.value)} placeholder="morning | afternoon | evening" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void runJob(false)} disabled={running}>
                    {running ? 'Running…' : 'Run now'}
                  </Button>
                  <Button variant="secondary" onClick={() => void runJob(true)} disabled={running}>
                    {running ? 'Running…' : 'Dry run'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave fields blank to process all currently due users. Add a user ID and optional window/date to run a specific card build path.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Executive Home Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="status" />
                <Input value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} placeholder="user id" />
                <Input value={localDateFilter} onChange={(e) => setLocalDateFilter(e.target.value)} placeholder="local date YYYY-MM-DD" />
                <Input value={windowFilter} onChange={(e) => setWindowFilter(e.target.value)} placeholder="window" />
              </div>
              {recentRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching runs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Window</th>
                        <th className="py-2 pr-3">User</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Duration</th>
                        <th className="py-2 pr-3">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRuns.map((run, idx) => (
                        <tr key={`${String((run as RunRow).run_id ?? idx)}`} className="border-t border-border/40 align-top">
                          <td className="py-2 pr-3">{String(run.local_date ?? '—')}</td>
                          <td className="py-2 pr-3">{String(run.window ?? '—')}</td>
                          <td className="py-2 pr-3 font-mono truncate max-w-[18ch]" title={String(run.user_id ?? '')}>{String(run.user_id ?? '—')}</td>
                          <td className="py-2 pr-3">{String(run.status ?? '—')}</td>
                          <td className="py-2 pr-3">{run.duration_ms != null ? `${String(run.duration_ms)} ms` : '—'}</td>
                          <td className="py-2 pr-3 max-w-[26ch]">
                            <div className="truncate text-destructive" title={String(run.error ?? '')}>{String(run.error ?? '—')}</div>
                            {run.error && (
                              <Button variant="ghost" size="sm" className="h-6 px-2 mt-1" onClick={() => void copyError(run.error)}>
                                Copy error
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
        );
      })()}
    </div>
  );
};

export default AdminJobs;
