import { useState, useEffect } from 'react';
import { Activity, Bell, Search, Loader2, AlertCircle, AlertTriangle, RefreshCw, User as UserIcon, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/services/authTokenService';

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

interface ConnectionIssue {
  issue: 'wearable' | 'calendar' | 'push';
  reason: string;
  detail: string;
  since: string | null;
}

interface RecoveryRequest {
  id?: string;
  issue: 'wearable' | 'calendar' | 'push';
  attempts: number;
  requested_by?: string | null;
  last_requested_at: string | null;
  last_prompt_shown_at?: string | null;
  push_sent_at: string | null;
  resolved_at?: string | null;
}

interface DiagnosticResult {
  userId: string;
  healthkit: HealthKitRecord | null;
  tokens: PushTokenRecord[];
  issues?: ConnectionIssue[];
  recovery?: RecoveryRequest[];
}

interface AlertRow {
  userId: string;
  email: string | null;
  name: string | null;
  issues: ConnectionIssue[];
  recovery: RecoveryRequest[];
}

interface ListedUser {
  id: string;
  email: string | null;
  name: string | null;
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

const syncTone = (status: string | null): 'green' | 'yellow' | 'red' | 'gray' => {
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
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  
  const [selectedUser, setSelectedUser] = useState<ListedUser | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [requesting, setRequesting] = useState(false);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  // Connection health alerts across all users (read-only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAlerts(true);
      setAlertsError(null);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-user-diagnostics?mode=alerts`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }
        const body = await res.json();
        if (!cancelled) setAlerts(body.alerts ?? []);
      } catch (err) {
        if (!cancelled) setAlertsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingAlerts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch list of users (search-aware, debounced)
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoadingUsers(true);
      setUsersError(null);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');

        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const params = new URLSearchParams({ limit: '100' });
        const q = search.trim();
        if (q) params.set('q', q);
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-list-users?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }

        const body = await res.json();
        if (cancelled) return;
        setUsers(body.users || []);
        setTotalUsers(typeof body.total === 'number' ? body.total : null);
      } catch (err) {
        if (!cancelled) setUsersError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }, search.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search]);

  const fetchDiagnostics = async (user: ListedUser) => {
    setSelectedUser(user);
    setLoadingDiagnostics(true);
    setDiagnosticsError(null);
    setResult(null);
    setRequestNotice(null);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams({ userId: user.id });
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
      setDiagnosticsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const requestRecovery = async (issue: 'wearable' | 'calendar' | 'push') => {
    if (!selectedUser) return;
    setRequesting(true);
    setRequestNotice(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-connection-recovery`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: selectedUser.id, issue }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      setRequestNotice(
        `Reconnect requested — attempt ${body?.request?.attempts ?? '?'}. The user will be prompted on next app open.`,
      );
      setResult((prev) =>
        prev
          ? {
              ...prev,
              recovery: [
                body.request as RecoveryRequest,
                ...(prev.recovery ?? []).filter((r) => r.issue !== issue),
              ],
            }
          : prev,
      );
    } catch (err) {
      setRequestNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setRequesting(false);
    }
  };

  const wearableRecovery = (result?.recovery ?? []).find((r) => r.issue === 'wearable');
  const wearableUnhealthy = (result?.issues ?? []).some((i) => i.issue === 'wearable');

  return (
    <div className="min-h-full bg-slate-50 -m-8 p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">User Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Select a user from the list to view their HealthKit sync and push notification health.
        </p>
      </header>

      <Card className="bg-white shadow-sm mb-6">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
          <CardTitle className="text-base">Connection health alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAlerts ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking all users...
            </div>
          ) : alertsError ? (
            <p className="text-sm text-red-600 py-2">{alertsError}</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">
              No watch or notification problems detected right now.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Problem</th>
                    <th className="px-4 py-3 font-medium">Detail</th>
                    <th className="px-4 py-3 font-medium">Retries</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alerts.map((row) => (
                    <tr key={row.userId} className="bg-white align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.name || 'Unnamed User'}</div>
                        <div className="text-xs text-slate-500">{row.email || 'No email'}</div>
                        <div className="font-mono text-[11px] text-slate-400 break-all">{row.userId}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.issues.map((i) => (
                          <Badge
                            key={i.issue + i.reason}
                            variant="outline"
                            className={`${badgeTone(i.issue === 'push' ? 'red' : 'yellow')} mr-1 mb-1 capitalize`}
                          >
                            {i.issue}
                          </Badge>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.issues.map((i) => (
                          <div key={i.issue + i.reason}>{i.detail}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.recovery.length === 0
                          ? '—'
                          : row.recovery.map((r) => (
                              <div key={r.issue} className="text-xs text-slate-600">
                                {r.issue}: {r.attempts} · last {formatDateTime(r.last_requested_at)}
                              </div>
                            ))}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            fetchDiagnostics({ id: row.userId, email: row.email, name: row.name })
                          }
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: User List */}
        <div className="lg:col-span-1">
          <Card className="bg-white h-[600px] flex flex-col">
            <CardHeader className="py-4 border-b border-slate-100 flex-shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-slate-500" />
                Select User
              </CardTitle>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email or user ID"
                  className="pl-9"
                  aria-label="Search users"
                />
              </div>
              {totalUsers !== null && totalUsers > users.length && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing {users.length} of {totalUsers} matches — refine your search to narrow results.
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {loadingUsers ? (
                <div className="flex items-center justify-center h-32 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                </div>
              ) : usersError ? (
                <div className="p-4 text-sm text-red-600">{usersError}</div>
              ) : users.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No users found.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <li key={user.id}>
                      <button
                        onClick={() => fetchDiagnostics(user)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors ${
                          selectedUser?.id === user.id ? 'bg-slate-50 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        <div className="truncate pr-4">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {user.name || 'Unnamed User'}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {user.email || 'No email'}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Diagnostics Results */}
        <div className="lg:col-span-2">
          {!selectedUser ? (
            <Card className="bg-white border-dashed shadow-sm flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center text-slate-500">
                <UserIcon className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>Select a user from the list to view diagnostics.</p>
              </div>
            </Card>
          ) : (
            <>
              {diagnosticsError && (
                <Card className="mb-6 bg-white border-red-200">
                  <CardContent className="p-6 flex items-center gap-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
                    {diagnosticsError}
                  </CardContent>
                </Card>
              )}

              {loadingDiagnostics ? (
                <Card className="bg-white shadow-sm flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p>Fetching diagnostics for {selectedUser.name || selectedUser.email}...</p>
                  </div>
                </Card>
              ) : result ? (
                <div className="grid gap-6">
                  <div className="text-sm text-slate-700 bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-1">
                     <div><span className="font-medium">User:</span> {selectedUser.name || 'Unnamed'} ({selectedUser.email || 'No email'})</div>
                     <div><span className="font-medium text-muted-foreground">ID:</span> <span className="font-mono text-xs">{result.userId}</span></div>
                  </div>

                  <Card className="bg-white shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                      <Activity className="h-5 w-5 text-emerald-600" aria-hidden />
                      <CardTitle className="text-base">HealthKit Sync</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!result.healthkit ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No HealthKit integration record found for this user.
                        </p>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-x-4">
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
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
                        <Button
                          size="sm"
                          onClick={() => requestRecovery('wearable')}
                          disabled={requesting || !wearableUnhealthy}
                        >
                          {requesting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Re-request HealthKit sync
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {wearableUnhealthy
                            ? `Retries: ${wearableRecovery?.attempts ?? 0}${
                                wearableRecovery?.last_requested_at
                                  ? ` · last ${formatDateTime(wearableRecovery.last_requested_at)}`
                                  : ''
                              }`
                            : 'Watch sync looks healthy — nothing to re-request.'}
                        </span>
                      </div>
                      {requestNotice && (
                        <p className="mt-2 text-xs text-slate-600">{requestNotice}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-white shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                      <Bell className="h-5 w-5 text-sky-600" aria-hidden />
                      <CardTitle className="text-base">Push Notifications</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {result.tokens.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No device tokens registered for this user.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-slate-100">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground border-b border-slate-100">
                              <tr>
                                <th className="px-4 py-3 font-medium">Platform</th>
                                <th className="px-4 py-3 font-medium">Active</th>
                                <th className="px-4 py-3 font-medium">Last Registered</th>
                                <th className="px-4 py-3 font-medium">Token</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {result.tokens.map((token) => (
                                <tr key={token.id} className="bg-white">
                                  <td className="px-4 py-3 capitalize whitespace-nowrap">{token.platform}</td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <Badge
                                      variant="outline"
                                      className={badgeTone(token.isActive ? 'green' : 'red')}
                                    >
                                      {token.isActive ? 'Yes' : 'No'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(token.updatedAt)}</td>
                                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground min-w-[120px]">
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
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUserDiagnostics;
