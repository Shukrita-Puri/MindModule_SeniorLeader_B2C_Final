import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthToken } from '@/services/authTokenService';

interface Job {
  id: string;
  name: string;
  source: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  recordsProcessed: number | null;
  relatedUserId: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
}

interface JobsResp {
  counts: { running: number; failed24h: number; success24h: number };
  lastExecutiveHomeBuildAt: string | null;
  lastNotificationJobAt: string | null;
  jobs: Job[];
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

const AdminJobs = () => {
  const [data, setData] = useState<JobsResp | null>(null);
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
          `https://${projectId}.supabase.co/functions/v1/admin-jobs-summary`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(body as JobsResp);
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
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          System background jobs and recent run history from real DB-backed sources.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading jobs…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['Running', data.counts.running],
              ['Failed (24h)', data.counts.failed24h],
              ['Successful (24h)', data.counts.success24h],
            ].map(([label, n]) => (
              <Card key={label as string}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</CardTitle>
                </CardHeader>
                <CardContent><div className="text-3xl font-semibold tabular-nums">{(n as number).toLocaleString()}</div></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Started</th>
                      <th className="py-2 pr-3">Finished</th>
                      <th className="py-2 pr-3">Duration</th>
                      <th className="py-2 pr-3">Processed</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={`${j.source}-${j.id}`} className="border-t border-border/40 align-top">
                        <td className="py-2 pr-3 font-mono">{j.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{j.source}</td>
                        <td className={`py-2 pr-3 ${j.status === 'error' ? 'text-destructive' : j.status === 'success' ? 'text-emerald-600' : ''}`}>{j.status}</td>
                        <td className="py-2 pr-3">{fmt(j.startedAt)}</td>
                        <td className="py-2 pr-3">{fmt(j.finishedAt)}</td>
                        <td className="py-2 pr-3 tabular-nums">{j.durationMs != null ? `${j.durationMs} ms` : '—'}</td>
                        <td className="py-2 pr-3 tabular-nums">{j.recordsProcessed ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono truncate max-w-[16ch]" title={j.relatedUserId ?? ''}>{j.relatedUserId ?? '—'}</td>
                        <td className="py-2 pr-3 text-destructive truncate max-w-[32ch]" title={j.error ?? ''}>{j.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminJobs;