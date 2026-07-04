import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAuthToken } from '@/services/authTokenService';

interface NotifRow {
  id: string;
  userId: string | null;
  time: string | null;
  deliveredAt: string | null;
  notificationType: string | null;
  variantId: string | null;
  status: string;
  channel: string;
  eventReference: string | null;
  apnsStatus?: number;
  apnsReason?: string;
  outcome?: string;
}
interface DeviceRow {
  id: string;
  userId: string | null;
  platform: string | null;
  tokenMasked: string | null;
  isActive: boolean;
  updatedAt: string | null;
}
interface Resp {
  counts: { totalReturned: number; failed24h: number; activeDeviceTokens: number };
  notifications: { available: boolean; reason: string | null; rows: NotifRow[] };
  devices: DeviceRow[];
}

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '—');

const AdminNotifications = () => {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (email) params.set('email', email);
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-notifications-list?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? `Admin API returned ${res.status}`);
        if (!cancelled) setData(body as Resp);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, email]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Recent delivery attempts and registered devices.</p>
      </header>

      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Status</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="sent">sent</option>
            <option value="delivered">delivered</option>
            <option value="failed">failed</option>
            <option value="undelivered">undelivered</option>
            <option value="pending">pending</option>
          </select>
        </div>
        <div className="w-72">
          <label className="text-xs text-muted-foreground block mb-1">User email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['Returned', data.counts.totalReturned],
              ['Failed (24h)', data.counts.failed24h],
              ['Active devices', data.counts.activeDeviceTokens],
            ].map(([label, n]) => (
              <Card key={label as string}>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-semibold tabular-nums">{(n as number).toLocaleString()}</div></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
            <CardContent>
              {!data.notifications.available ? (
                <p className="text-sm text-muted-foreground">
                  No notification log available. {data.notifications.reason}
                </p>
              ) : data.notifications.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications in window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">User</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Channel</th>
                        <th className="py-2 pr-3">APNs</th>
                        <th className="py-2 pr-3">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.notifications.rows.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="py-1 pr-3">{fmt(r.time)}</td>
                          <td className="py-1 pr-3 font-mono truncate max-w-[14ch]" title={r.userId ?? ''}>{r.userId ?? '—'}</td>
                          <td className="py-1 pr-3">{r.notificationType ?? '—'}</td>
                          <td className={`py-1 pr-3 ${r.status === 'failed' || r.status === 'undelivered' ? 'text-destructive' : ''}`}>{r.status}</td>
                          <td className="py-1 pr-3">{r.channel}</td>
                          <td className="py-1 pr-3">{r.apnsStatus ?? '—'}{r.apnsReason ? ` (${r.apnsReason})` : ''}</td>
                          <td className="py-1 pr-3 truncate max-w-[16ch]" title={r.eventReference ?? ''}>{r.eventReference ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Active device tokens</CardTitle></CardHeader>
            <CardContent>
              {data.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active device tokens.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Updated</th>
                        <th className="py-2 pr-3">User</th>
                        <th className="py-2 pr-3">Platform</th>
                        <th className="py-2 pr-3">Token</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.devices.map((d) => (
                        <tr key={d.id} className="border-t border-border/40">
                          <td className="py-1 pr-3">{fmt(d.updatedAt)}</td>
                          <td className="py-1 pr-3 font-mono truncate max-w-[14ch]" title={d.userId ?? ''}>{d.userId ?? '—'}</td>
                          <td className="py-1 pr-3">{d.platform ?? '—'}</td>
                          <td className="py-1 pr-3 font-mono">{d.tokenMasked ?? '—'}</td>
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

export default AdminNotifications;