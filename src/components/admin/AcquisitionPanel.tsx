import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/services/authTokenService';
import { getSupabaseFunctionUrl } from '@/utils/supabaseFunctions';
import { toast } from 'sonner';

interface FunnelData {
  opens: number;
  signups: number;
  onboardingStarted: number;
  onboardingFinished: number;
  subscribed: number;
  manualDownloads: number;
}

interface PageRow {
  route: string;
  views: number;
  avgSeconds: number;
  medianSeconds: number;
  totalMinutes: number;
  lastSeenAt: string;
}

interface StepRow {
  key: string;
  label: string;
  reachedAt: string | null;
}

interface PersonRow {
  kind: 'user' | 'install';
  userId: string | null;
  installId: string | null;
  email: string | null;
  name: string | null;
  platform: string | null;
  country: string | null;
  funnelStage: string;
  onboardingStage: string;
  onboardingSteps: StepRow[];
  firstOpenAt: string | null;
  signupAt: string | null;
  lastActiveAt: string | null;
  activeDays: number;
  views: number;
  totalMinutes: number;
  sessions: number;
  avgMinutesPerSession: number;
  topRoute: string | null;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  goingQuiet: boolean;
  pages: PageRow[];
  neverUsedPages: string[];
  notificationOptIn: boolean;
  remindersSent: number;
}

interface Analytics {
  generatedAt: string;
  days: number;
  funnel: FunnelData;
  people: PersonRow[];
  totals: {
    installsTracked: number;
    screenViewsTracked: number;
    anonymousInstalls: number;
    installsOptedIntoNotifications: number;
  };
}

const WINDOWS = [7, 30, 60, 90];

function pct(part: number, whole: number | null): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

const AcquisitionPanel = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadDate, setDownloadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloadCount, setDownloadCount] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${getSupabaseFunctionUrl('admin-acquisition-analytics')}?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const saveDownloads = async () => {
    const value = Number(downloadCount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a download count');
      return;
    }
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(getSupabaseFunctionUrl('admin-set-app-store-downloads'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: downloadDate, downloads: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      toast.success('App Store downloads saved');
      setDownloadCount('');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const funnelRows = data
    ? [
        { label: 'App Store downloads (manual)', value: data.funnel.manualDownloads, of: null as number | null },
        { label: 'Opened the app', value: data.funnel.opens, of: data.funnel.manualDownloads || null },
        { label: 'Signed up', value: data.funnel.signups, of: data.funnel.opens },
        { label: 'Started onboarding', value: data.funnel.onboardingStarted, of: data.funnel.signups },
        { label: 'Finished onboarding', value: data.funnel.onboardingFinished, of: data.funnel.onboardingStarted },
        { label: 'Subscribed / trialing', value: data.funnel.subscribed, of: data.funnel.signups },
      ]
    : [];

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.people;
    return data.people.filter((p) =>
      [p.email, p.name, p.userId, p.installId]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const rowKey = (p: PersonRow) => p.userId ?? `install:${p.installId}`;

  return (
    <section className="space-y-6 rounded-md border border-border p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Acquisition &amp; engagement</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Last ${data.days} days · ${rows.length} rows · ${data.totals.screenViewsTracked} screen views · refreshed ${new Date(data.generatedAt).toLocaleTimeString()}`
              : loading ? 'Loading…' : '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              size="sm"
              variant={w === days ? 'default' : 'outline'}
              className="h-7 px-3 text-xs"
              onClick={() => setDays(w)}
            >
              {w}d
            </Button>
          ))}
          <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Input
            placeholder="Search email, name, or id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-64"
          />
        </div>
      </header>

      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          {/* Funnel summary strip */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {funnelRows.map((row) => (
              <div key={row.label} className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="text-2xl font-semibold">{row.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{row.label}</div>
                {row.of !== null && (
                  <div className="mt-1 text-xs text-muted-foreground">{pct(row.value, row.of)} of previous step</div>
                )}
              </div>
            ))}
          </div>

          {/* Manual App Store downloads entry */}
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 bg-muted/10 p-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">App Store downloads — date</label>
              <Input type="date" value={downloadDate} onChange={(e) => setDownloadDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Downloads that day</label>
              <Input
                type="number"
                min={0}
                value={downloadCount}
                onChange={(e) => setDownloadCount(e.target.value)}
                className="w-32"
                placeholder="e.g. 1"
              />
            </div>
            <Button size="sm" onClick={() => void saveDownloads()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Typed in from App Store Connect — Apple never provides who downloaded.
            </p>
          </div>

          {/* One row per person */}
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3">Platform</th>
                  <th className="py-2 px-3">Country</th>
                  <th className="py-2 px-3">Funnel stage</th>
                  <th className="py-2 px-3">Onboarding stage</th>
                  <th className="py-2 px-3">First open</th>
                  <th className="py-2 px-3">Signed up</th>
                  <th className="py-2 px-3">Last active</th>
                  <th className="py-2 px-3">Active days</th>
                  <th className="py-2 px-3">Views</th>
                  <th className="py-2 px-3">Mins</th>
                  <th className="py-2 px-3">Avg mins/session</th>
                  <th className="py-2 px-3">Most-used page</th>
                  <th className="py-2 px-3">Subscription</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={17} className="py-10 text-center text-sm text-muted-foreground">
                      No people match this search.
                    </td>
                  </tr>
                )}
                {rows.map((p) => {
                  const key = rowKey(p);
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="cursor-pointer border-t border-border/60 hover:bg-muted/30"
                        onClick={() => setExpanded(isOpen ? null : key)}
                      >
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="mr-1 text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
                          {p.name ?? (p.kind === 'install' ? 'Anonymous install' : '—')}
                        </td>
                        <td className="py-2 px-3">{p.email ?? '—'}</td>
                        <td
                          className="py-2 px-3 font-mono text-xs truncate max-w-[16ch]"
                          title={p.userId ?? p.installId ?? ''}
                        >
                          {p.userId ?? p.installId ?? '—'}
                        </td>
                        <td className="py-2 px-3">{p.platform ?? '—'}</td>
                        <td className="py-2 px-3">{p.country ?? '—'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{p.funnelStage}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{p.onboardingStage}</td>
                        <td className="py-2 px-3">{fmtDate(p.firstOpenAt)}</td>
                        <td className="py-2 px-3">{fmtDate(p.signupAt)}</td>
                        <td className="py-2 px-3">{fmtDate(p.lastActiveAt)}</td>
                        <td className="py-2 px-3">{p.activeDays}</td>
                        <td className="py-2 px-3">{p.views}</td>
                        <td className="py-2 px-3">{p.totalMinutes}</td>
                        <td className="py-2 px-3">{p.avgMinutesPerSession}</td>
                        <td className="py-2 px-3 font-mono text-xs">{p.topRoute ?? '—'}</td>
                        <td className="py-2 px-3">{p.subscriptionStatus ?? '—'}</td>
                        <td className="py-2 px-3">
                          {p.views === 0 ? (
                            <Badge variant="outline">No activity</Badge>
                          ) : p.goingQuiet ? (
                            <Badge variant="destructive">Going quiet</Badge>
                          ) : (
                            <Badge variant="outline">Active</Badge>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border/60 bg-muted/10">
                          <td colSpan={17} className="p-4">
                            <div className="grid gap-6 lg:grid-cols-2">
                              <div>
                                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Features used by this person
                                </h4>
                                {p.pages.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No screen time recorded in this window.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead className="text-left text-muted-foreground">
                                      <tr>
                                        <th className="py-1 pr-3">Page</th>
                                        <th className="py-1 pr-3">Views</th>
                                        <th className="py-1 pr-3">Avg</th>
                                        <th className="py-1 pr-3">Median</th>
                                        <th className="py-1 pr-3">Total mins</th>
                                        <th className="py-1 pr-3">Last opened</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {p.pages.map((pg) => (
                                        <tr key={pg.route} className="border-t border-border/40">
                                          <td className="py-1 pr-3 font-mono">{pg.route}</td>
                                          <td className="py-1 pr-3">{pg.views}</td>
                                          <td className="py-1 pr-3">{pg.avgSeconds}s</td>
                                          <td className="py-1 pr-3">{pg.medianSeconds}s</td>
                                          <td className="py-1 pr-3">{pg.totalMinutes}</td>
                                          <td className="py-1 pr-3">{fmtDate(pg.lastSeenAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                                {p.neverUsedPages.length > 0 && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Never opened: <span className="font-mono">{p.neverUsedPages.join(' · ')}</span>
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Onboarding steps
                                </h4>
                                <table className="w-full text-xs">
                                  <tbody>
                                    {p.onboardingSteps.map((s) => (
                                      <tr key={s.key} className="border-t border-border/40">
                                        <td className="py-1 pr-3 text-muted-foreground">{s.label}</td>
                                        <td className="py-1">
                                          {s.reachedAt
                                            ? (s.key === 'onboarding_completed_at'
                                                ? `Completed · ${fmtDate(s.reachedAt)}`
                                                : fmtDate(s.reachedAt))
                                            : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {p.kind === 'install' && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Opened but never signed up ·{' '}
                                    {p.notificationOptIn ? `${p.remindersSent} reminder(s) sent` : 'no notification permission'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

export default AcquisitionPanel;
