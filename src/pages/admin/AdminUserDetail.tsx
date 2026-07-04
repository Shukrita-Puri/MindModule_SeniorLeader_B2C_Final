import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAuthToken } from '@/services/authTokenService';
import { useImpersonation } from '@/hooks/useImpersonation';
import { toast } from 'sonner';

type Row = Record<string, unknown>;
interface Detail {
  profile: Row;
  latestCheckIn: Row | null;
  latestWearable: Row | null;
  calendarConnections: Row[];
  latestBrief: Row | null;
  latestPlan: Row | null;
  latestMrs: Row | null;
  deviceTokens: Row[];
  recentCardRuns: Row[];
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-sm">{children}</CardContent>
  </Card>
);

const KeyVal = ({ data }: { data: Row | null }) => {
  if (!data) return <p className="text-muted-foreground">No data.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-border/40 py-1">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-mono text-xs truncate max-w-[24ch]" title={String(v ?? '')}>
            {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const AdminUserDetail = () => {
  const { userId = '' } = useParams<{ userId: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { start } = useImpersonation();

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
          `https://${projectId}.supabase.co/functions/v1/admin-user-detail?userId=${encodeURIComponent(userId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as Detail;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const viewAsUser = async () => {
    if (!data?.profile) return;
    const p = data.profile as Row & { id?: string; email?: string; display_name?: string; full_name?: string };
    const res = await start({
      id: p.id ?? userId,
      email: (p.email as string) ?? '',
      name: (p.display_name as string) ?? (p.full_name as string) ?? null,
    });
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to start impersonation');
      return;
    }
    navigate('/executive-home');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link to="/admin/users" className="text-xs text-muted-foreground underline underline-offset-4">← Users</Link>
          <h1 className="text-2xl font-semibold">
            {(data?.profile?.email as string | undefined) ?? userId}
          </h1>
          <p className="text-xs font-mono text-muted-foreground truncate max-w-[60ch]">{userId}</p>
        </div>
        <Button onClick={viewAsUser} disabled={!data}>View app as this user</Button>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Profile"><KeyVal data={data.profile} /></Section>
          <Section title="Latest check-in"><KeyVal data={data.latestCheckIn} /></Section>
          <Section title="Latest wearable"><KeyVal data={data.latestWearable} /></Section>
          <Section title="Latest MRS / context"><KeyVal data={data.latestMrs} /></Section>
          <Section title="Latest Brief"><KeyVal data={data.latestBrief} /></Section>
          <Section title="Latest Plan"><KeyVal data={data.latestPlan} /></Section>
          <Section title="Calendar connections">
            {data.calendarConnections.length === 0
              ? <p className="text-muted-foreground">No calendar connections.</p>
              : data.calendarConnections.map((c, i) => (
                  <div key={i} className="border-b border-border/40 py-2 first:border-t"><KeyVal data={c} /></div>
                ))}
          </Section>
          <Section title="Device tokens (APNs)">
            {data.deviceTokens.length === 0
              ? <p className="text-muted-foreground">No device tokens.</p>
              : data.deviceTokens.map((c, i) => (
                  <div key={i} className="border-b border-border/40 py-2 first:border-t"><KeyVal data={c} /></div>
                ))}
          </Section>
          <Section title="Recent card runs">
            {data.recentCardRuns.length === 0
              ? <p className="text-muted-foreground">No recent runs.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3">Date</th>
                        <th className="py-1 pr-3">Window</th>
                        <th className="py-1 pr-3">Mode</th>
                        <th className="py-1 pr-3">Status</th>
                        <th className="py-1 pr-3">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentCardRuns.map((r, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="py-1 pr-3">{String((r as Row).local_date ?? '—')}</td>
                          <td className="py-1 pr-3">{String((r as Row).window ?? '—')}</td>
                          <td className="py-1 pr-3">{String((r as Row).mode ?? '—')}</td>
                          <td className="py-1 pr-3">{String((r as Row).status ?? '—')}</td>
                          <td className="py-1 pr-3 truncate max-w-[36ch]" title={String((r as Row).error ?? '')}>
                            {String((r as Row).error ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Section>
        </div>
      )}
    </div>
  );
};

export default AdminUserDetail;