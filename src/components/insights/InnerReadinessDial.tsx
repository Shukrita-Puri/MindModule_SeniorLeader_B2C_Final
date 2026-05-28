import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfWeek, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

type Tier = 'green' | 'amber' | 'red' | null;

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

const InnerReadinessDial = () => {
  const { user } = useAuth();
  const { data: outer } = useOuterReadiness();
  const [history, setHistory] = useState<Array<{ score_date: string; composite_score: number; energy_tier: string }>>([]);
  const [checkinDaily, setCheckinDaily] = useState<Record<string, number>>({});

  const uid = DEV_MODE ? DEV_USER.id : user?.id;

  useEffect(() => {
    if (!uid) return;
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const mondayISO = format(monday, 'yyyy-MM-dd');
    (async () => {
      // Canonical source: inner_readiness_scores (server-written).
      const innerPromise = supabase
        .from('inner_readiness_scores')
        .select('score_date, composite_score, energy_tier')
        .eq('user_id', uid)
        .gte('score_date', mondayISO)
        .order('score_date', { ascending: true });
      // Fallback source: daily_checkins. Average composites per day so a
      // user who checks in multiple times still gets one final score for
      // that day.
      const checkPromise = supabase
        .from('daily_checkins')
        .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
        .eq('user_id', uid)
        .gte('checkin_date', mondayISO)
        .order('checkin_date', { ascending: true });

      const [innerRes, checkRes] = await Promise.all([innerPromise, checkPromise]);
      if (innerRes.data) setHistory(innerRes.data);
      if (checkRes.data) {
        const grouped: Record<string, number[]> = {};
        for (const row of checkRes.data as any[]) {
          const c = checkinComposite(row);
          if (c === null) continue;
          (grouped[row.checkin_date] ||= []).push(c);
        }
        const avg: Record<string, number> = {};
        for (const [d, arr] of Object.entries(grouped)) {
          avg[d] = arr.reduce((a, b) => a + b, 0) / arr.length;
        }
        setCheckinDaily(avg);
      }
    })();
  }, [uid]);

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
      // Prefer the canonical inner_readiness_scores row when present
      // (average if there is more than one) AND only if it carries a real
      // numeric composite_score — otherwise fall back to the averaged
      // daily-checkin composite for that day.
      const innerRows = history.filter(
        h => h.score_date === ds && typeof h.composite_score === 'number' && Number.isFinite(h.composite_score),
      );
      let t: Tier;
      if (isToday) {
        t = todayTier;
      } else if (innerRows.length > 0) {
        const avgInner = innerRows.reduce((a, b) => a + (b.composite_score as number), 0) / innerRows.length;
        t = tierFor(avgInner, innerRows[innerRows.length - 1].energy_tier);
      } else if (typeof checkinDaily[ds] === 'number') {
        t = tierFor(checkinDaily[ds]);
      } else {
        t = null;
      }
      return { date: ds, label: format(d, 'EEEEE'), tier: t, isToday, isFuture };
    });
  }, [history, checkinDaily, todayTier]);

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
        'w-full text-left rounded-2xl bg-white/65 backdrop-blur-[30px] backdrop-saturate-150',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'px-5 pt-4 pb-5',
      )}
      aria-label="Your performance trajectory this week"
    >
      <div className="mb-2">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-foreground">
          Your Performance Trajectory
        </span>
        <span className="block text-[11px] tracking-[0.12em] uppercase text-muted-foreground/80 mt-0.5">
          Inner Readiness Streak · This Week
        </span>
      </div>
      <div className="flex items-center gap-4">
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
            {todayTier ? tierLabel[todayTier] : 'Awaiting check-in'}
          </div>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(d => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className={cn('text-[10px] uppercase tracking-wider', d.isToday ? 'text-foreground font-semibold' : 'text-muted-foreground/70')}>{d.label}</span>
                <span
                  className={cn('block w-3.5 h-3.5 rounded-full border', d.isToday ? 'ring-2 ring-offset-1 ring-foreground/40' : '')}
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
            Resets every Monday. Past days hold their daily colour.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InnerReadinessDial;