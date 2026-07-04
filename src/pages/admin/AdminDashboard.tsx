import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthToken } from '@/services/authTokenService';

interface Summary {
  generatedAt: string;
  counts: Record<string, number>;
  lastExecutiveHomeBuildAt?: string | null;
  lastNotificationJobAt?: string | null;
  latestCriticalError?: { id: string; time: string; summary: string } | null;
  recentFailedRuns: Array<{
    run_id: string;
    user_id: string;
    local_date: string | null;
    window: string | null;
    mode: string | null;
    status: string;
    error: string | null;
    duration_ms: number | null;
  }>;
}

const LABELS: Record<string, string> = {
  totalUsers: 'Total users',
  onboardedUsers: 'Users onboarded',
  wearableConnected: 'Wearable connected',
  calendarConnected: 'Calendar connected',
  executiveHomeCardsToday: 'Executive Home cards today',
  subscriptionsActive: 'Subscriptions active',
  subscriptionsTrialing: 'Trials in progress',
  activeDeviceTokens: 'Active APNs tokens',
};

const JOB_LABELS: Record<string, string> = {
  runningJobs: 'Running jobs',
  successJobs24h: 'Successful jobs (24h)',
  failedJobs24h: 'Failed jobs (24h)',
};

const ERROR_LABELS: Record<string, string> = {
  errors24h: 'Errors (24h)',
  errors7d: 'Errors (7d)',
  failedCardBuilds24h: 'Failed Executive Home builds (24h)',
  failedNotificationDeliveries24h: 'Failed notification deliveries (24h)',
};

const AdminDashboard = () => {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-dashboard-summary`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as Summary;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live operational counts. Refresh the page for the latest snapshot.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading summary…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(LABELS).map(([key, label]) => (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold tabular-nums">
                    {(data.counts[key] ?? 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Jobs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(JOB_LABELS).map(([key, label]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tabular-nums">{(data.counts[key] ?? 0).toLocaleString()}</div>
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Last builds</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1">
                  <div><span className="text-muted-foreground">Exec Home: </span>{data.lastExecutiveHomeBuildAt ? new Date(data.lastExecutiveHomeBuildAt).toLocaleString() : '—'}</div>
                  <div><span className="text-muted-foreground">Notifications: </span>{data.lastNotificationJobAt ? new Date(data.lastNotificationJobAt).toLocaleString() : '—'}</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Errors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(ERROR_LABELS).map(([key, label]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tabular-nums">{(data.counts[key] ?? 0).toLocaleString()}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {data.latestCriticalError && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Latest critical error</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1">
                  <div className="text-muted-foreground">{new Date(data.latestCriticalError.time).toLocaleString()}</div>
                  <div className="text-destructive break-words">{data.latestCriticalError.summary}</div>
                </CardContent>
              </Card>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent failed card runs</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentFailedRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent failures.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Window</th>
                        <th className="py-2 pr-4">Mode</th>
                        <th className="py-2 pr-4">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentFailedRuns.map((r) => (
                        <tr key={r.run_id} className="border-t border-border/50">
                          <td className="py-2 pr-4 font-mono text-xs truncate max-w-[16ch]" title={r.user_id}>
                            {r.user_id}
                          </td>
                          <td className="py-2 pr-4">{r.local_date ?? '—'}</td>
                          <td className="py-2 pr-4">{r.window ?? '—'}</td>
                          <td className="py-2 pr-4">{r.mode ?? '—'}</td>
                          <td className="py-2 pr-4 text-destructive truncate max-w-[36ch]" title={r.error ?? ''}>
                            {r.error ?? '—'}
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
      )}
    </div>
  );
};

export default AdminDashboard;