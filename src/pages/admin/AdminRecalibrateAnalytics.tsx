import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { getAuthToken } from '@/services/authTokenService';

interface Named { contentId: string; title: string; category: string }

interface ProtocolRow {
  contentId: string;
  title: string;
  category: string;
  contentType: string;
  subType: string;
  sessions: number;
  uniqueUsers: number;
  avgDuration: number;
  repeatRate: number;
  peakTimeOfDay: string;
  peakDayOfWeek: string;
  loopSignal: boolean;
}

interface Analytics {
  generatedAt: string;
  days: number;
  globals: {
    totalSessions: number;
    uniqueUsers: number;
    uniqueContent: number;
    avgSessionsPerUser: number;
    avgDurationSeconds: number;
    activeDaysSpan: number;
  };
  categories: Array<{ category: string; sessions: number; uniqueUsers: number; avgDuration: number; pctOfTotal: number }>;
  protocols: ProtocolRow[];
  rarelyUsed: ProtocolRow[];
  neverUsed: Named[];
  timing: {
    byTimeOfDay: Array<{ slot: string; sessions: number; pct: number }>;
    byDayOfWeek: Array<{ day: string; sessions: number; pct: number }>;
    peakCombo: { day: string; slot: string; sessions: number };
  };
  powerUsers: Array<{
    userId: string;
    email: string | null;
    name: string | null;
    sessions: number;
    uniqueContent: number;
    categories: { pause: number; presence: number; powerUp: number };
    activeDays: number;
    mostUsedTitle: string;
    loopDays: number;
    avgDailyIntensity: number;
  }>;
  loopEvents: Array<{ date: string; userId: string; email: string | null; title: string; count: number; category: string }>;
  planExposure: {
    totalPlans: number;
    distinctRecommended: number;
    catalogueSize: number;
    coveragePct: number;
    top10Share: number;
    avgRepeatPerUser: number;
    topRecommended: Array<{ contentId: string; title: string; category: string; plans: number; users: number; pctOfRecs: number }>;
    neverRecommended: Named[];
    heavyRepeats: Array<{ userId: string; email: string | null; title: string; times: number }>;
    route: {
      planLed: number;
      direct: number;
      planLedPct: number;
      byContent: Array<{ contentId: string; title: string; planLed: number; direct: number; total: number }>;
    };
    followThrough: { assignedTotal: number; completedTotal: number; completionPct: number };
  };
  gaps: {
    highDemandUncovered: string[];
    loopedButNoAlternative: string[];
    morningUnderpenetrated: boolean;
    morningPct: number;
    fridayLoadHigh: boolean;
    categoryImbalance: string | null;
    planRotationNarrow: boolean;
    planCoveragePct: number;
  };
}

type SortKey = 'sessions' | 'uniqueUsers' | 'repeatRate' | 'avgDuration' | 'title';

const Bar = ({ pct }: { pct: number }) => (
  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
  </div>
);

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const Collapsible = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title}
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
};

const AdminRecalibrateAnalytics = () => {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [sortKey, setSortKey] = useState<SortKey>('sessions');
  const [showAllProtocols, setShowAllProtocols] = useState(false);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-recalibrate-analytics?days=${windowDays}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as Analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [load, days]);

  const protocols = useMemo(() => {
    if (!data) return [];
    const rows = [...data.protocols].sort((a, b) =>
      sortKey === 'title' ? a.title.localeCompare(b.title) : (b[sortKey] as number) - (a[sortKey] as number),
    );
    return showAllProtocols ? rows : rows.slice(0, 20);
  }, [data, sortKey, showAllProtocols]);

  const th = (label: string, key: SortKey) => (
    <th className="px-3 py-2 text-left font-medium cursor-pointer select-none" onClick={() => setSortKey(key)}>
      {label}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Recalibrate Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of how the Recalibrate library is used. Last {days} days.
            {data && <> · Refreshed {new Date(data.generatedAt).toLocaleString()}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[30, 90, 180].map((d) => (
            <Button key={d} size="sm" variant={d === days ? 'default' : 'outline'} onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load(days)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && !data && <div className="text-sm text-muted-foreground">Loading…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Sessions" value={data.globals.totalSessions} />
            <Stat label="Unique users" value={data.globals.uniqueUsers} />
            <Stat label="Protocols used" value={data.globals.uniqueContent} />
            <Stat label="Avg / user" value={data.globals.avgSessionsPerUser} />
            <Stat label="Avg duration" value={`${Math.round(data.globals.avgDurationSeconds / 60)}m`} />
            <Stat label="Day span" value={data.globals.activeDaysSpan} />
          </div>

          <Section title="Category mix">
            <div className="space-y-3">
              {data.categories.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{c.category}</span>
                    <span className="text-muted-foreground">{c.sessions} · {c.pctOfTotal}% · {c.uniqueUsers} users</span>
                  </div>
                  <Bar pct={c.pctOfTotal} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Protocol usage">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    {th('Protocol', 'title')}
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    {th('Sessions', 'sessions')}
                    {th('Users', 'uniqueUsers')}
                    {th('Repeat', 'repeatRate')}
                    {th('Avg dur', 'avgDuration')}
                    <th className="px-3 py-2 text-left font-medium">Peak time</th>
                    <th className="px-3 py-2 text-left font-medium">Peak day</th>
                    <th className="px-3 py-2 text-left font-medium">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {protocols.map((p) => (
                    <tr key={p.contentId} className="border-b border-border/50">
                      <td className="px-3 py-2">{p.title}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{p.category}</td>
                      <td className="px-3 py-2">{p.sessions}</td>
                      <td className="px-3 py-2">{p.uniqueUsers}</td>
                      <td className="px-3 py-2">{p.repeatRate}</td>
                      <td className="px-3 py-2">{Math.round(p.avgDuration / 60)}m</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{p.peakTimeOfDay}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.peakDayOfWeek}</td>
                      <td className="px-3 py-2">
                        {p.loopSignal && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />loop</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.protocols.length > 20 && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAllProtocols((s) => !s)}>
                {showAllProtocols ? 'Show top 20' : `Show all ${data.protocols.length}`}
              </Button>
            )}
          </Section>

          <Collapsible title="Low traction (1–3 sessions)" count={data.rarelyUsed.length}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {data.rarelyUsed.map((p) => (
                    <tr key={p.contentId} className="border-b border-border/50">
                      <td className="px-3 py-2">{p.title}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{p.category}</td>
                      <td className="px-3 py-2">{p.sessions} sessions</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>

          <Collapsible title="Never used" count={data.neverUsed.length}>
            <div className="flex flex-wrap gap-2">
              {data.neverUsed.map((c) => (
                <Badge key={c.contentId} variant="outline">{c.title}</Badge>
              ))}
            </div>
          </Collapsible>

          <Section title="Timing">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                {data.timing.byTimeOfDay.map((t) => (
                  <div key={t.slot}>
                    <div className="flex justify-between text-sm mb-1"><span className="capitalize">{t.slot}</span><span className="text-muted-foreground">{t.sessions} · {t.pct}%</span></div>
                    <Bar pct={t.pct} />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {data.timing.byDayOfWeek.map((d) => (
                  <div key={d.day}>
                    <div className="flex justify-between text-sm mb-1"><span>{d.day}</span><span className="text-muted-foreground">{d.sessions} · {d.pct}%</span></div>
                    <Bar pct={d.pct} />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-md bg-muted/60 p-3 text-sm">
              Peak usage window: <strong className="capitalize">{data.timing.peakCombo.day} {data.timing.peakCombo.slot}</strong> ({data.timing.peakCombo.sessions} sessions)
            </div>
          </Section>

          <Section title={`Power users (10+ sessions) — ${data.powerUsers.length}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">User</th>
                    <th className="px-3 py-2 text-left font-medium">Sessions</th>
                    <th className="px-3 py-2 text-left font-medium">Protocols</th>
                    <th className="px-3 py-2 text-left font-medium">Pause / Presence / Power-up</th>
                    <th className="px-3 py-2 text-left font-medium">Active days</th>
                    <th className="px-3 py-2 text-left font-medium">Most used</th>
                    <th className="px-3 py-2 text-left font-medium">Loop days</th>
                    <th className="px-3 py-2 text-left font-medium">Daily intensity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.powerUsers.map((u) => (
                    <tr key={u.userId} className="border-b border-border/50 align-top">
                      <td className="px-3 py-2">
                        <div>{u.email ?? '—'}</div>
                        <div className="text-xs text-muted-foreground break-all">{u.userId}</div>
                      </td>
                      <td className="px-3 py-2">{u.sessions}</td>
                      <td className="px-3 py-2">{u.uniqueContent}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.categories.pause} / {u.categories.presence} / {u.categories.powerUp}</td>
                      <td className="px-3 py-2">{u.activeDays}</td>
                      <td className="px-3 py-2">{u.mostUsedTitle}</td>
                      <td className="px-3 py-2">{u.loopDays > 0 ? <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">{u.loopDays}</Badge> : 0}</td>
                      <td className="px-3 py-2">{u.avgDailyIntensity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Collapsible title="Loop / crisis signals (same protocol 3+ times in a day)" count={data.loopEvents.length}>
            <p className="text-sm text-muted-foreground mb-3">Repeated same-day use often signals an unmet need rather than a favourite.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {data.loopEvents.map((l, i) => (
                    <tr key={`${l.userId}-${l.date}-${i}`} className="border-b border-border/50">
                      <td className="px-3 py-2">{l.date}</td>
                      <td className="px-3 py-2">
                        <div>{l.email ?? '—'}</div>
                        <div className="text-xs text-muted-foreground break-all">{l.userId}</div>
                      </td>
                      <td className="px-3 py-2">{l.title}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{l.category}</td>
                      <td className="px-3 py-2">{l.count}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>

          <Section title="Plan exposure and variety">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Stat label="Plans" value={data.planExposure.totalPlans} />
              <Stat label="Catalogue coverage" value={`${data.planExposure.coveragePct}%`} />
              <Stat label="Top-10 share" value={`${data.planExposure.top10Share}%`} />
              <Stat label="Avg repeats / person" value={data.planExposure.avgRepeatPerUser} />
            </div>

            <div className="text-sm font-medium mb-2">Most recommended</div>
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Practice</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Plans</th>
                    <th className="px-3 py-2 text-left font-medium">People</th>
                    <th className="px-3 py-2 text-left font-medium">% of recs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planExposure.topRecommended.map((r) => (
                    <tr key={r.contentId} className="border-b border-border/50">
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{r.category}</td>
                      <td className="px-3 py-2">{r.plans}</td>
                      <td className="px-3 py-2">{r.users}</td>
                      <td className="px-3 py-2">{r.pctOfRecs}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-medium mb-2">Route to practice</div>
                <div className="mb-1 flex justify-between text-sm"><span>Plan-led</span><span className="text-muted-foreground">{data.planExposure.route.planLed} · {data.planExposure.route.planLedPct}%</span></div>
                <Bar pct={data.planExposure.route.planLedPct} />
                <div className="mt-3 mb-1 flex justify-between text-sm"><span>Direct in Recalibrate</span><span className="text-muted-foreground">{data.planExposure.route.direct} · {(100 - data.planExposure.route.planLedPct).toFixed(1)}%</span></div>
                <Bar pct={100 - data.planExposure.route.planLedPct} />
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Plan follow-through</div>
                <div className="text-sm text-muted-foreground">
                  {data.planExposure.followThrough.completedTotal} of {data.planExposure.followThrough.assignedTotal} recommended practices completed
                  ({data.planExposure.followThrough.completionPct}%).
                </div>
                <div className="mt-2"><Bar pct={data.planExposure.followThrough.completionPct} /></div>
              </div>
            </div>

            <div className="mt-6 text-sm font-medium mb-2">Top practices by route</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {data.planExposure.route.byContent.map((r) => (
                    <tr key={r.contentId} className="border-b border-border/50">
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">plan {r.planLed}</td>
                      <td className="px-3 py-2 text-muted-foreground">direct {r.direct}</td>
                      <td className="px-3 py-2">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Collapsible title="Never recommended by the plan" count={data.planExposure.neverRecommended.length}>
            <div className="flex flex-wrap gap-2">
              {data.planExposure.neverRecommended.map((c) => (
                <Badge key={c.contentId} variant="outline">{c.title}</Badge>
              ))}
            </div>
          </Collapsible>

          <Collapsible title="Heavily repeated recommendations (5+ to the same person)" count={data.planExposure.heavyRepeats.length}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {data.planExposure.heavyRepeats.map((r, i) => (
                    <tr key={`${r.userId}-${i}`} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <div>{r.email ?? '—'}</div>
                        <div className="text-xs text-muted-foreground break-all">{r.userId}</div>
                      </td>
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2">{r.times}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>

          <Section title="Content gaps">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              {data.gaps.categoryImbalance && <li>{data.gaps.categoryImbalance} — consider adding depth there.</li>}
              {data.gaps.highDemandUncovered.length > 0 && (
                <li>High demand, thin catalogue: {data.gaps.highDemandUncovered.join(', ')}.</li>
              )}
              {data.gaps.morningUnderpenetrated && <li>Mornings are under-used ({data.gaps.morningPct}% of sessions) — the morning prompt may not be landing.</li>}
              {data.gaps.fridayLoadHigh && <li>Friday carries the heaviest load — end-of-week pressure is showing up in usage.</li>}
              {data.gaps.loopedButNoAlternative.length > 0 && (
                <li>{data.gaps.loopedButNoAlternative.length} looped protocol(s) have no tried alternative in the same category.</li>
              )}
              {data.gaps.planRotationNarrow && (
                <li>Plan rotation is narrow — the top 10 practices hold {data.planExposure.top10Share}% of all recommendations (catalogue coverage {data.gaps.planCoveragePct}%).</li>
              )}
              {!data.gaps.categoryImbalance &&
                data.gaps.highDemandUncovered.length === 0 &&
                !data.gaps.morningUnderpenetrated &&
                !data.gaps.fridayLoadHigh &&
                !data.gaps.planRotationNarrow &&
                data.gaps.loopedButNoAlternative.length === 0 && <li>No notable gaps detected in this window.</li>}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
};

export default AdminRecalibrateAnalytics;
