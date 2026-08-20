import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfWeek, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { getAuthToken } from '@/services/authTokenService';
import { useMrsTrend } from '@/hooks/useMrsTrend';
import MrsSparkline from '@/components/home/mrs/MrsSparkline';

type Tier = 'green' | 'amber' | 'red' | null;

/**
 * The half dial duplicates the MRS score already shown on the executive home
 * cards, so it is suppressed here. Geometry + render code kept intact so it
 * can be resurfaced by flipping this flag.
 */
const SHOW_INNER_READINESS_DIAL = false;

// Score → tier ranges (canonical, also shown to the user in copy):
//   Red    (Depleted)  : score <  40
//   Amber  (Recovering): 40 ≤ score < 67
//   Green  (Strong)    : score ≥ 67
function tierFor(score: number | null | undefined, energyTier?: string | null): Tier {
  if (typeof score !== 'number') {
    if (energyTier === 'peak' || energyTier === 'strong') return 'green';
    if (energyTier === 'managing') return 'amber';
    if (energyTier === 'depleted') return 'red';
    return null;
  }
  if (score >= 67) return 'green';
  if (score >= 40) return 'amber';
  return 'red';
}

const tierColor: Record<NonNullable<Tier>, string> = {
  green: 'hsl(142 55% 42%)',
  amber: 'hsl(38 85% 52%)',
  red:   'hsl(8 75% 55%)',
};

const tierLabel: Record<NonNullable<Tier>, string> = {
  green: 'Strong',
  amber: 'Recovering',
  red:   'Depleted',
};

interface DayDot {
  date: string;
  label: string;
  tier: Tier;
  isToday: boolean;
  isFuture: boolean;
}

// Local composite mirroring the spirit of energyStateEngine.overallBalance:
// average of the four dimensions on a 0–100 scale, with pressure inverted
// (low pressure_level = overloaded → low score).
function checkinComposite(c: {
  clarity_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;
  regulation_level?: number | null;
}): number | null {
  const toPct = (v: number | null | undefined) =>
    typeof v === 'number' ? ((v - 1) / 4) * 100 : null;
  const pressureInverted = typeof c.pressure_level === 'number'
    ? ((5 - c.pressure_level) / 4) * 100
    : null;
  const parts = [toPct(c.clarity_level), toPct(c.emotion_level), pressureInverted, toPct(c.regulation_level)]
    .filter((v): v is number => typeof v === 'number');
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

type CheckinRow = {
  checkin_date?: string | null;
  clarity_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;
  regulation_level?: number | null;
};

/** Collapse multiple check-ins on a date into one 0–100 composite. */
function aggregateCheckins(rows: CheckinRow[]): Record<string, number> {
  const buckets: Record<string, number[]> = {};
  for (const r of rows) {
    const d = r?.checkin_date;
    if (!d) continue;
    const c = checkinComposite(r);
    if (c === null) continue;
    (buckets[d] ||= []).push(c);
  }
  const out: Record<string, number> = {};
  for (const [d, vals] of Object.entries(buckets)) {
    out[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

const InnerReadinessDial = () => {
  const { user } = useAuth();
  const { data: outer } = useOuterReadiness();
  const [snapshots, setSnapshots] = useState<Array<{ local_date: string; score: number | null; tier: string | null }>>([]);
  const [checkinDays, setCheckinDays] = useState<Record<string, number>>({});
  const [showFirstReadingNotice, setShowFirstReadingNotice] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem('insights.trajectory.expanded') !== '0';
  });
  const [range, setRange] = useState<7 | 30 | 180>(7);
  const todayScoreForTrend =
    typeof outer?.innerReadinessScore === 'number' ? Math.round(outer.innerReadinessScore) : null;
  const trend = useMrsTrend(todayScoreForTrend, range);
  const readinessState = outer?.innerReadinessState ?? null;
  const hasTodayScore = todayScoreForTrend != null;
  const isEarlyRead = hasTodayScore && readinessState === 'awaiting';
  const isAwaiting = !hasTodayScore || readinessState === 'awaiting';
  const localDayKey = format(new Date(), 'yyyy-MM-dd');

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem('insights.trajectory.expanded', next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  };

  const uid = DEV_MODE ? DEV_USER.id : user?.id;

  useEffect(() => {
    if (!uid) return;
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const mondayISO = format(monday, 'yyyy-MM-dd');
    const sundayISO = format(addDays(monday, 6), 'yyyy-MM-dd');
    (async () => {
      // Canonical source: brief_snapshots via brief-history edge function.
      // Same table that powers the "past briefs" side panel — one row per
      // generated brief carries the score/tier that already drove the dial
      // at that moment in time.
      try {
        const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
        const base = `https://${projectId}.supabase.co/functions/v1/brief-history`;
        // Sprint 1 (Phase 1): trend must only aggregate briefs actually
        // delivered to the user. Undelivered snapshot rows (generated but
        // never rendered) must NOT leak into weekly readiness trend.
        // Weekly dots colour from any snapshot that carries a numeric score.
        // The delivered-only rule still governs the Trend panel + brief
        // history; here a generated-but-unopened brief is still a real
        // reading of that day and must not blank the dot.
        const url = `${base}?startDate=${mondayISO}&endDate=${sundayISO}&limit=100`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (DEV_MODE) {
          const anon = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
          if (anon) headers['Authorization'] = `Bearer ${anon}`;
        } else {
          const token = await getAuthToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(url, { headers });
        if (res.ok) {
          const json = await res.json();
          setSnapshots((json?.briefs || []).map((b: any) => ({
            local_date: b.local_date,
            score: typeof b.score === 'number' ? b.score : null,
            tier: b.tier ?? null,
          })));
        }
      } catch (err) {
        console.error('[InnerReadinessDial] brief-history fetch failed:', err);
      }

      // Secondary source: days that only carry a self check-in still deserve
      // a colour. Composite mirrors energyStateEngine.overallBalance.
      try {
        if (DEV_MODE) {
          const { data } = await supabase
            .from('daily_checkins')
            .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
            .eq('user_id', uid)
            .gte('checkin_date', mondayISO)
            .lte('checkin_date', sundayISO);
          setCheckinDays(aggregateCheckins(data || []));
        } else {
          const token = await getAuthToken();
          if (token) {
            const { data } = await supabase.functions.invoke('daily-checkins', {
              headers: { Authorization: `Bearer ${token}` },
              body: { action: 'GET_MONTHLY_LEVELS', startDate: mondayISO, endDate: sundayISO },
            });
            setCheckinDays(aggregateCheckins(data?.data || []));
          }
        }
      } catch (err) {
        console.error('[InnerReadinessDial] check-in fetch failed:', err);
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const noticeKey = `mrs-inner-awaiting:${localDayKey}`;
    try {
      if (isAwaiting) {
        window.localStorage.setItem(noticeKey, '1');
        setShowFirstReadingNotice(false);
        return;
      }
      const hadAwaiting = window.localStorage.getItem(noticeKey) === '1';
      setShowFirstReadingNotice(hadAwaiting);
      if (hadAwaiting) {
        window.localStorage.removeItem(noticeKey);
      }
    } catch {
      setShowFirstReadingNotice(false);
    }
  }, [isAwaiting, localDayKey]);

  const todayScore = typeof outer?.innerReadinessScore === 'number' ? Math.round(outer.innerReadinessScore) : null;
  const todayTier = tierFor(todayScore, outer?.innerReadinessTier);

  const days: DayDot[] = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(monday, i);
      const ds = format(d, 'yyyy-MM-dd');
      const isToday = ds === todayStr;
      const isFuture = d.getTime() > Date.now() && !isToday;
      // Average every brief snapshot recorded for that local date — if the
      // user got multiple briefs (morning / afternoon / evening) we collapse
      // them to one daily colour.
      const dayRows = snapshots.filter(s => s.local_date === ds && typeof s.score === 'number' && Number.isFinite(s.score as number));
      let t: Tier;
      if (isToday) {
        t = todayTier;
      } else if (dayRows.length > 0) {
        const avg = dayRows.reduce((a, b) => a + (b.score as number), 0) / dayRows.length;
        t = tierFor(avg, dayRows[dayRows.length - 1].tier);
      } else if (typeof checkinDays[ds] === 'number') {
        // No brief for that day, but the user did self-assess — colour from
        // the check-in composite rather than leaving the day blank.
        t = tierFor(checkinDays[ds]);
      } else {
        t = null;
      }
      return { date: ds, label: format(d, 'EEEEE'), tier: t, isToday, isFuture };
    });
  }, [snapshots, todayTier, checkinDays]);

  // Semicircular dial geometry
  const W = 180, H = 100, CX = 90, CY = 90, R = 72, STROKE = 10;
  const arcPath = (startAngle: number, endAngle: number) => {
    const toXY = (a: number) => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
    const [x1, y1] = toXY(startAngle);
    const [x2, y2] = toXY(endAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };
  // arcs spanning 180° (left to right): π → 2π
  const aStart = Math.PI;
  const aEnd = 2 * Math.PI;
  const seg = (aEnd - aStart) / 3;

  return (
    <div
      className={cn(
        'w-full text-left rounded-2xl bg-white',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'px-5 pt-4 pb-5',
      )}
      aria-label="Your performance trajectory this week"
    >
      <div className="mb-3">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-foreground">
          Your Performance Trajectory
        </span>
        <span className="block text-[11px] tracking-[0.12em] uppercase text-muted-foreground/80 mt-0.5">
          Mental Readiness Streak · This Week
        </span>
      </div>
      <div className={cn('flex items-center', SHOW_INNER_READINESS_DIAL && 'gap-4')}>
        {SHOW_INNER_READINESS_DIAL && (
        <div className="flex-shrink-0">
          <svg viewBox={`0 0 ${W} ${H}`} width="160" height="92" aria-hidden>
            <path d={arcPath(aStart, aStart + seg)} stroke={tierColor.red} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'red' ? 1 : 0.28} />
            <path d={arcPath(aStart + seg, aStart + 2 * seg)} stroke={tierColor.amber} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'amber' ? 1 : 0.28} />
            <path d={arcPath(aStart + 2 * seg, aEnd)} stroke={tierColor.green} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'green' ? 1 : 0.28} />
            <text x={CX} y={CY - 18} textAnchor="middle" className="font-headline" fontSize="32" fill="hsl(var(--foreground))" fontWeight={600}>
              {todayScore !== null ? todayScore : '—'}
            </text>
          </svg>
          <div className="text-center -mt-2 text-[11px] tracking-[0.18em] uppercase" style={{ color: todayTier ? tierColor[todayTier] : 'hsl(var(--muted-foreground))' }}>
            {!hasTodayScore
              ? 'Awaiting data'
              : isEarlyRead
                ? 'EARLY READ'
                : (todayTier ? tierLabel[todayTier] : 'Awaiting check-in')}
          </div>
        </div>
        )}
        <div className="flex-1">
          <div className="grid grid-cols-7 gap-2">
            {days.map(d => (
              <div key={d.date} className="flex flex-col items-center gap-2">
                <span className={cn('text-[13px] uppercase tracking-wider', d.isToday ? 'text-foreground font-semibold' : 'text-muted-foreground/70')}>{d.label}</span>
                <span
                  className={cn('block w-7 h-7 rounded-full border', d.isToday ? 'ring-2 ring-offset-2 ring-foreground/40' : '')}
                  style={{
                    background: d.tier ? tierColor[d.tier] : 'transparent',
                    borderColor: d.tier ? tierColor[d.tier] : 'hsl(var(--muted-foreground) / 0.35)',
                    opacity: d.isFuture ? 0.4 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-3 leading-snug">
            {isAwaiting
              ? 'No recent wearable data — sync in Connected Data, or check in to take a self-assessment.'
              : 'Resets every Monday. Past days hold their daily colour.'}
          </p>
        </div>
      </div>
      {showFirstReadingNotice && !isAwaiting && (
        <p className="mt-3 text-[11px] text-muted-foreground/75">
          First reading of the day is in.
        </p>
      )}
      {expanded && (
        <div
          id="trajectory-trend-panel"
          className="mt-4 pt-4 border-t border-border/40"
        >
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Trend
            </span>
            <div className="flex items-center gap-1 rounded-full bg-muted/40 p-0.5">
              {([7, 30, 180] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] rounded-full transition-colors',
                    r === range
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {r === 7 ? '1W' : r === 30 ? '1M' : '6M'}
                </button>
              ))}
            </div>
          </div>
          <MrsSparkline history={trend.data?.history ?? []} height={84} />
          <p className="mt-3 text-[11px] text-muted-foreground/80 text-left">
            {range === 180
              ? trend.data?.trajectoryCaption ?? 'Building your 6-month trajectory'
              : trend.data?.caption ?? 'Building your trend history'}
          </p>
        </div>
      )}
    </div>
  );
};

export default InnerReadinessDial;
