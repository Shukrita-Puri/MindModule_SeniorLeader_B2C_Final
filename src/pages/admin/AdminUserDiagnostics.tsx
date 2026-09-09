import { useState } from 'react';
import { Activity, Bell, Search, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Read-only admin diagnostic view: HealthKit sync + push token status.
 * Currently backed by mock fixtures so the UI can be reviewed end-to-end.
 * No mutations are exposed anywhere in this page.
 */

type HealthConnection = 'connected' | 'disconnected' | 'permission_revoked';
type HealthSync = 'synced' | 'waiting_for_data' | 'sync_delayed' | 'error';
type PushPermission = 'granted' | 'denied' | 'provisional' | 'not_determined';

interface DiagnosticRecord {
  userId: string;
  email: string;
  displayName: string;
  healthkit: {
    connectionStatus: HealthConnection;
    syncStatus: HealthSync;
    lastSyncAt: string | null;
    lastSampleAt: string | null;
    lastError: string | null;
  };
  push: {
    hasActiveToken: boolean;
    platform: 'iOS' | 'Android' | 'Web' | null;
    lastRegisteredAt: string | null;
    permissionState: PushPermission;
    recentErrors: string[];
  };
}

const MOCK_RECORDS: DiagnosticRecord[] = [
  {
    userId: 'google-oauth2|100000000000000000001',
    email: 'healthy.exec@mindmodule.me',
    displayName: 'Priya Raman',
    healthkit: {
      connectionStatus: 'connected',
      syncStatus: 'synced',
      lastSyncAt: '2026-09-09T05:12:00Z',
      lastSampleAt: '2026-09-09T04:58:00Z',
      lastError: null,
    },
    push: {
      hasActiveToken: true,
      platform: 'iOS',
      lastRegisteredAt: '2026-09-08T19:44:00Z',
      permissionState: 'granted',
      recentErrors: [],
    },
  },
  {
    userId: 'google-oauth2|100000000000000000002',
    email: 'delayed.exec@mindmodule.me',
    displayName: 'Daniel Okoye',
    healthkit: {
      connectionStatus: 'connected',
      syncStatus: 'sync_delayed',
      lastSyncAt: '2026-09-06T23:03:00Z',
      lastSampleAt: '2026-09-06T21:40:00Z',
      lastError: 'Background delivery skipped: background refresh disabled for 62h',
    },
    push: {
      hasActiveToken: false,
      platform: 'iOS',
      lastRegisteredAt: '2026-08-21T07:12:00Z',
      permissionState: 'denied',
      recentErrors: [
        'APNs 410 Unregistered — token deactivated 2026-09-05',
        'Dispatch skipped: no active device token (2026-09-08)',
      ],
    },
  },
  {
    userId: 'google-oauth2|100000000000000000003',
    email: 'revoked.exec@mindmodule.me',
    displayName: 'Marta Feldt',
    healthkit: {
      connectionStatus: 'permission_revoked',
      syncStatus: 'error',
      lastSyncAt: '2026-08-30T06:01:00Z',
      lastSampleAt: null,
      lastError: 'HealthKit authorization revoked in iOS Settings',
    },
    push: {
      hasActiveToken: true,
      platform: 'Web',
      lastRegisteredAt: '2026-09-07T11:20:00Z',
      permissionState: 'provisional',
      recentErrors: ['Quiet delivery only — provisional authorization'],
    },
  },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const badgeTone = (tone: 'green' | 'yellow' | 'red' | 'gray') => {
  switch (tone) {
    case 'green': return 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
    case 'yellow': return 'bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100';
    case 'red': return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100';
    default: return 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100';
  }
};

const connectionTone: Record<HealthConnection, 'green' | 'gray' | 'red'> = {
  connected: 'green',
  disconnected: 'gray',
  permission_revoked: 'red',
};

const syncTone: Record<HealthSync, 'green' | 'yellow' | 'red'> = {
  synced: 'green',
  waiting_for_data: 'yellow',
  sync_delayed: 'yellow',
  error: 'red',
};

const permissionTone: Record<PushPermission, 'green' | 'yellow' | 'red' | 'gray'> = {
  granted: 'green',
  provisional: 'yellow',
  denied: 'red',
  not_determined: 'gray',
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-b-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

const AdminUserDiagnostics = () => {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [record, setRecord] = useState<DiagnosticRecord | null>(null);

  const runSearch = () => {
    const q = query.trim().toLowerCase();
    setSearched(true);
    if (!q) { setRecord(null); return; }
    const found = MOCK_RECORDS.find(
      (r) => r.email.toLowerCase() === q || r.userId.toLowerCase() === q
        || r.email.toLowerCase().includes(q),
    );
    setRecord(found ?? null);
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="Search by email or user ID"
                aria-label="Search by email or user ID"
                className="pl-9"
              />
            </div>
            <Button onClick={runSearch}>Search</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sample accounts: healthy.exec@mindmodule.me · delayed.exec@mindmodule.me · revoked.exec@mindmodule.me
          </p>
        </CardContent>
      </Card>

      {searched && !record && (
        <Card className="bg-white">
          <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" aria-hidden />
            No user found for that email or ID.
          </CardContent>
        </Card>
      )}

      {record && (
        <>
          <div className="mb-4 text-sm text-slate-700">
            <span className="font-medium">{record.displayName}</span>
            <span className="text-muted-foreground"> · {record.email} · {record.userId}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Activity className="h-5 w-5 text-emerald-600" aria-hidden />
                <CardTitle className="text-base">HealthKit Integration</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Field label="Connection Status">
                  <Badge variant="outline" className={badgeTone(connectionTone[record.healthkit.connectionStatus])}>
                    {record.healthkit.connectionStatus}
                  </Badge>
                </Field>
                <Field label="Sync Status">
                  <Badge variant="outline" className={badgeTone(syncTone[record.healthkit.syncStatus])}>
                    {record.healthkit.syncStatus}
                  </Badge>
                </Field>
                <Field label="Last Sync Date">{formatDateTime(record.healthkit.lastSyncAt)}</Field>
                <Field label="Last Sample Date">{formatDateTime(record.healthkit.lastSampleAt)}</Field>
                <Field label="Last Error">
                  {record.healthkit.lastError
                    ? <span className="text-red-600">{record.healthkit.lastError}</span>
                    : <span className="text-muted-foreground">None</span>}
                </Field>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Bell className="h-5 w-5 text-sky-600" aria-hidden />
                <CardTitle className="text-base">Push Notifications</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Field label="Active Token">
                  <Badge variant="outline" className={badgeTone(record.push.hasActiveToken ? 'green' : 'red')}>
                    {record.push.hasActiveToken ? 'Yes' : 'No'}
                  </Badge>
                </Field>
                <Field label="Platform">{record.push.platform ?? '—'}</Field>
                <Field label="Last Registered">{formatDateTime(record.push.lastRegisteredAt)}</Field>
                <Field label="Push Permission State">
                  <Badge variant="outline" className={badgeTone(permissionTone[record.push.permissionState])}>
                    {record.push.permissionState}
                  </Badge>
                </Field>
                <Field label="Recent Errors">
                  {record.push.recentErrors.length === 0
                    ? <span className="text-muted-foreground">None</span>
                    : (
                      <ul className="space-y-1">
                        {record.push.recentErrors.map((e) => (
                          <li key={e} className="text-red-600">{e}</li>
                        ))}
                      </ul>
                    )}
                </Field>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminUserDiagnostics;
