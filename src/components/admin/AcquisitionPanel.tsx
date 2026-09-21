import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface DailyRow {
  date: string;
  opens: number;
  signups: number;
  completions: number;
  downloads: number;
}

interface StepRow { key: string; label: string; reached: number }
interface StuckRow { step: string; count: number }

interface PageRow {
  route: string;
  views: number;
  uniqueInstalls: number;
  uniqueUsers: number;
  avgSeconds: number;
  medianSeconds: number;
  totalMinutes: number;
}

interface UserRow {
  userId: string;
  email: string | null;
  name: string | null;
  lastActive: string;
  activeDays: number;
  views: number;
  totalMinutes: number;
  topRoute: string | null;
  onboardingFinished: boolean;
  subscriptionStatus: string | null;
  goingQuiet: boolean;
}

interface InstallRow {
  installId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  platform: string | null;
  country: string | null;
  appVersion: string | null;
  notificationOptIn: boolean;
  notificationStatus: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
}

interface Analytics {
  generatedAt: string;
  days: number;
  funnel: FunnelData;
  daily: DailyRow[];
  onboardingSteps: StepRow[];
  stuckAt: StuckRow[];
  topPages: PageRow[];
  userEngagement: UserRow[];
  anonymousInstalls: InstallRow[];
  totals: {
    installsTracked: number;
    screenViewsTracked: number;
    anonymousInstalls: number;
    installsOptedIntoNotifications: number;
  };
}

const WINDOWS = [7, 30, 60, 90];

function pct(part: number, whole: number): string {
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

  const maxDaily = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      ...data.daily.map((d) => Math.max(d.opens, d.signups, d.completions, d.downloads)),
    );
  }, [data]);

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

  return (
    <section className="space-y-6 rounded-md border border-border p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Acquisition &amp; engagement</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Last ${data.days} days · ${data.totals.installsTracked} installs · ${data.totals.screenViewsTracked} screen views · refreshed ${new Date(data.generatedAt).toLocaleTimeString()}`
              : loading ? 'Loading…' : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </header>

      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          {/* Funnel */}
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

          {/* Daily chart */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Daily: opens · sign-ups · finished onboarding · downloads</h3>
            {data.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded in this window yet.</p>
            ) : (
              <div className="space-y-1">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">{d.date.slice(5)}</span>
                    <div className="flex-1 space-y-[2px]">
                      <div className="h-2 rounded-sm bg-primary/70" style={{ width: `${(d.opens / maxDaily) * 100}%` }} />
                      <div className="h-2 rounded-sm bg-primary/40" style={{ width: `${(d.signups / maxDaily) * 100}%` }} />
                      <div className="h-2 rounded-sm bg-primary/20" style={{ width: `${(d.completions / maxDaily) * 100}%` }} />
                      {d.downloads > 0 && (
                        <div className="h-2 rounded-sm bg-muted-foreground/40" style={{ width: `${(d.downloads / maxDaily) * 100}%` }} />
                      )}
                    </div>
                    <span className="w-40 shrink-0 text-right text-muted-foreground">
                      {d.opens} / {d.signups} / {d.completions}{d.downloads ? ` / ${d.downloads}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Onboarding drop-off */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Onboarding steps reached</h3>
              <div className="space-y-1">
                {data.onboardingSteps.map((s) => {
                  const base = data.onboardingSteps[0]?.reached || 1;
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-xs">
                      <span className="w-44 shrink-0 text-muted-foreground">{s.label}</span>
                      <div className="h-2 flex-1 rounded-sm bg-muted">
                        <div className="h-2 rounded-sm bg-primary/60" style={{ width: `${(s.reached / base) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right">{s.reached}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Still sitting at</h3>
              {data.stuckAt.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is mid-onboarding.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.stuckAt.map((s) => (
                    <Badge key={s.step} variant="outline">{s.step} · {s.count}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top pages */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Pages used most</h3>
            {data.topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No screen time recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">Page</th>
                      <th className="py-2 px-3">Views</th>
                      <th className="py-2 px-3">People</th>
                      <th className="py-2 px-3">Devices</th>
                      <th className="py-2 px-3">Avg time</th>
                      <th className="py-2 px-3">Median</th>
                      <th className="py-2 px-3">Total mins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.map((p) => (
                      <tr key={p.route} className="border-t border-border/60">
                        <td className="py-2 px-3 font-mono text-xs">{p.route}</td>
                        <td className="py-2 px-3">{p.views}</td>
                        <td className="py-2 px-3">{p.uniqueUsers}</td>
                        <td className="py-2 px-3">{p.uniqueInstalls}</td>
                        <td className="py-2 px-3">{p.avgSeconds}s</td>
                        <td className="py-2 px-3">{p.medianSeconds}s</td>
                        <td className="py-2 px-3">{p.totalMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per-person engagement */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Per-person engagement — your outreach list</h3>
            {data.userEngagement.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signed-in activity recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Last active</th>
                      <th className="py-2 px-3">Active days</th>
                      <th className="py-2 px-3">Minutes</th>
                      <th className="py-2 px-3">Most-used page</th>
                      <th className="py-2 px-3">Onboarded</th>
                      <th className="py-2 px-3">Subscription</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.userEngagement.map((u) => (
                      <tr key={u.userId} className="border-t border-border/60">
                        <td className="py-2 px-3">{u.email ?? u.userId}</td>
                        <td className="py-2 px-3">{fmtDate(u.lastActive)}</td>
                        <td className="py-2 px-3">{u.activeDays}</td>
                        <td className="py-2 px-3">{u.totalMinutes}</td>
                        <td className="py-2 px-3 font-mono text-xs">{u.topRoute ?? '—'}</td>
                        <td className="py-2 px-3">{u.onboardingFinished ? 'Yes' : 'No'}</td>
                        <td className="py-2 px-3">{u.subscriptionStatus ?? '—'}</td>
                        <td className="py-2 px-3">
                          {u.goingQuiet ? <Badge variant="destructive">Going quiet</Badge> : <Badge variant="outline">Active</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Anonymous installs */}
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Opened but never signed up ({data.totals.anonymousInstalls}) ·{' '}
              {data.totals.installsOptedIntoNotifications} can be reminded
            </h3>
            {data.anonymousInstalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every tracked install has an account.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">First open</th>
                      <th className="py-2 px-3">Last open</th>
                      <th className="py-2 px-3">Platform</th>
                      <th className="py-2 px-3">Country</th>
                      <th className="py-2 px-3">App version</th>
                      <th className="py-2 px-3">Reminders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anonymousInstalls.map((i) => (
                      <tr key={i.installId} className="border-t border-border/60">
                        <td className="py-2 px-3">{fmtDate(i.firstSeenAt)}</td>
                        <td className="py-2 px-3">{fmtDate(i.lastSeenAt)}</td>
                        <td className="py-2 px-3">{i.platform ?? '—'}</td>
                        <td className="py-2 px-3">{i.country ?? '—'}</td>
                        <td className="py-2 px-3">{i.appVersion ?? '—'}</td>
                        <td className="py-2 px-3">
                          {i.notificationOptIn ? `${i.remindersSent} sent` : 'no permission'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default AcquisitionPanel;
