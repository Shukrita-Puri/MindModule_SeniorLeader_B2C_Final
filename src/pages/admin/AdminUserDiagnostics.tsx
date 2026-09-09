import { useState } from 'react';
import { Activity, Bell, Search, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/services/authTokenService';

/**
 * Read-only admin diagnostic view: HealthKit sync + push token status.
 * Queries real backend data for a single user_id. No mutations are exposed.
 */

interface HealthKitRecord {
  watch_connection_status: string | null;
  watch_sync_status: string | null;
  watch_last_sync_at: string | null;
  watch_last_sample_at: string | null;
  watch_last_error: string | null;
}

interface PushTokenRecord {
  id: string;
  platform: string;
  isActive: boolean;
  updatedAt: string;
  deviceTokenMasked: string | null;
}

interface DiagnosticResult {
  userId: string;
  healthkit: HealthKitRecord | null;
  tokens: PushTokenRecord[];
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const badgeTone = (tone: 'green' | 'yellow' | 'red' | 'gray') => {
  switch (tone) {
    case 'green':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
    case 'yellow':
      return 'bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100';
    case 'red':
      return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100';
  }
};

const connectionTone = (status: string | null): 'green' | 'gray' | 'red' => {
  switch (status?.toLowerCase()) {
    case 'connected':
      return 'green';
    case 'permission_revoked':
      return 'red';
    default:
      return 'gray';
  }
};

const syncTone = (status: string | null): 'green' | 'yellow' | 'red' => {
  switch (status?.toLowerCase()) {
    case 'synced':
      return 'green';
    case 'waiting_for_data':
    case 'sync_delayed':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-b-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

const AdminUserDiagnostics = () => {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchDiagnostics = async () => {
    const id = userId.trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(true);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams({ userId: id });
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-user-diagnostics?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }

      const body = await res.json();
      setResult(body as DiagnosticResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 -m-8 p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">User Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Read-only check of HealthKit sync and push notification health for a single user.
        </p>
      </header>

      <Card className="mb-6 bg-white">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchDiagnostics();
                }}
                placeholder="Enter user_id"
                aria-label="Enter user_id"
                className="pl-9"
              />
            </div>
            <Button onClick={fetchDiagnostics} disabled={loading || !userId.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </>
              ) : (
                'Fetch Diagnostics'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 bg-white border-red-200">
          <CardContent className="p-6 flex items-center gap-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {error}
          </CardContent>
        </Card>
      )}

      {searched && !loading && !error && result && (
        <>
          <div className="mb-4 text-sm text-slate-700">
            <span className="font-medium">User ID:</span>{' '}
            <span className="text-muted-foreground font-mono">{result.userId}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Activity className="h-5 w-5 text-emerald-600" aria-hidden />
                <CardTitle className="text-base">HealthKit Sync</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!result.healthkit ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No HealthKit integration record found for this user.
                  </p>
                ) : (
                  <>
                    <Field label="Connection Status">
                      <Badge
                        variant="outline"
                        className={badgeTone(connectionTone(result.healthkit.watch_connection_status))}
                      >
                        {result.healthkit.watch_connection_status ?? 'unknown'}
                      </Badge>
                    </Field>
                    <Field label="Sync Status">
                      <Badge
                        variant="outline"
                        className={badgeTone(syncTone(result.healthkit.watch_sync_status))}
                      >
                        {result.healthkit.watch_sync_status ?? 'unknown'}
                      </Badge>
                    </Field>
                    <Field label="Last Sync Date">
                      {formatDateTime(result.healthkit.watch_last_sync_at)}
                    </Field>
                    <Field label="Last Sample Date">
                      {formatDateTime(result.healthkit.watch_last_sample_at)}
                    </Field>
                    <Field label="Last Error">
                      {result.healthkit.watch_last_error ? (
                        <span className="text-red-600">{result.healthkit.watch_last_error}</span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </Field>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Bell className="h-5 w-5 text-sky-600" aria-hidden />
                <CardTitle className="text-base">Push Notifications</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {result.tokens.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No device tokens registered for this user.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-slate-100">
                        <tr>
                          <th className="py-2 pr-3">Platform</th>
                          <th className="py-2 pr-3">Active</th>
                          <th className="py-2 pr-3">Last Registered</th>
                          <th className="py-2">Token</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.tokens.map((token) => (
                          <tr key={token.id} className="border-b border-slate-50 last:border-b-0">
                            <td className="py-2 pr-3 capitalize">{token.platform}</td>
                            <td className="py-2 pr-3">
                              <Badge
                                variant="outline"
                                className={badgeTone(token.isActive ? 'green' : 'red')}
                              >
                                {token.isActive ? 'Yes' : 'No'}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3">{formatDateTime(token.updatedAt)}</td>
                            <td className="py-2 font-mono text-xs text-muted-foreground">
                              {token.deviceTokenMasked ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminUserDiagnostics;
