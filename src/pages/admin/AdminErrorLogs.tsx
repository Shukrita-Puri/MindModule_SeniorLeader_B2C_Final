import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAuthToken } from '@/services/authTokenService';

interface Row {
  id: string;
  time: string;
  source: string;
  severity: string;
  userId: string | null;
  summary: string;
  details: unknown;
  relatedRunId: string | null;
  status: string;
}

interface Resp { generatedAt: string; total: number; rows: Row[] }

const SOURCES = ['', 'executive_home_card_runs', 'notification_log', 'audit_logs'];

const AdminErrorLogs = () => {
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [hours, setHours] = useState(24 * 7);
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sinceIso = useMemo(() => new Date(Date.now() - hours * 3600 * 1000).toISOString(), [hours]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams({ since: sinceIso });
      if (source) params.set('source', source);
      if (q) params.set('q', q);
      if (userId) params.set('userId', userId);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-error-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setData(body as Resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Error Logs</h1>
        <p className="text-sm text-muted-foreground">
          System failures from executive home builds, notification logs, and admin audits. Sensitive fields are redacted server-side.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                {SOURCES.map((s) => <option key={s || 'all'} value={s}>{s || 'All'}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Search</span>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="text in error…" />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">User ID</span>
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="auth0|…" />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Time range</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <option value={1}>Last hour</option>
                <option value={24}>Last 24h</option>
                <option value={24 * 7}>Last 7 days</option>
                <option value={24 * 30}>Last 30 days</option>
              </select>
            </label>
            <Button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <Card>
          <CardHeader><CardTitle className="text-base">{data.total} error{data.total === 1 ? '' : 's'}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Summary</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <>
                      <tr key={r.id} className="border-t border-border/40 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.time).toLocaleString()}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.source}</td>
                        <td className="py-2 pr-3">{r.severity}</td>
                        <td className="py-2 pr-3 font-mono truncate max-w-[16ch]" title={r.userId ?? ''}>{r.userId ?? '—'}</td>
                        <td className="py-2 pr-3 text-destructive max-w-[48ch] truncate" title={r.summary}>{r.summary}</td>
                        <td className="py-2 pr-3">{r.status}</td>
                        <td className="py-2 pr-3">
                          <button className="text-xs underline" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                            {expanded === r.id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr key={`${r.id}-details`} className="bg-muted/30">
                          <td colSpan={7} className="p-3">
                            <pre className="text-[11px] whitespace-pre-wrap break-all font-mono">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminErrorLogs;