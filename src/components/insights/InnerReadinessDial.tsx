import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfWeek, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

type Tier = 'green' | 'amber' | 'red' | null;

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

const InnerReadinessDial = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: outer } = useOuterReadiness();
  const [history, setHistory] = useState<Array<{ score_date: string; composite_score: number; energy_tier: string }>>([]);

  const uid = DEV_MODE ? DEV_USER.id : user?.id;

  useEffect(() => {
    if (!uid) return;
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    (async () => {
      const { data } = await supabase
        .from('inner_readiness_scores')
        .select('score_date, composite_score, energy_tier')
        .eq('user_id', uid)
        .gte('score_date', format(monday, 'yyyy-MM-dd'))
        .order('score_date', { ascending: true });
      if (data) setHistory(data);
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
      // pick the most recent score for that day
      const rows = history.filter(h => h.score_date === ds);
      const last = rows.length ? rows[rows.length - 1] : null;
      const isToday = ds === todayStr;
      const isFuture = d.getTime() > Date.now() && !isToday;
      const t: Tier = isToday
        ? todayTier
        : last
          ? tierFor(last.composite_score, last.energy_tier)
          : null;
      return { date: ds, label: format(d, 'EEEEE'), tier: t, isToday, isFuture };
    });
  }, [history, todayTier]);

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
  const score = todayScore ?? 0;
  const needleAngle = aStart + (Math.max(0, Math.min(100, score)) / 100) * (aEnd - aStart);
  const needleLen = R - 4;
  const nx = CX + needleLen * Math.cos(needleAngle);
  const ny = CY + needleLen * Math.sin(needleAngle);

  return (
    <button
      type="button"
      onClick={() => navigate('/insights/leadership-patterns')}
      className={cn(
        'w-full text-left rounded-2xl bg-white/65 backdrop-blur-[30px] backdrop-saturate-150',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'transition-transform duration-200 active:scale-[0.99]',
        'px-5 pt-4 pb-5',
      )}
      aria-label="Inner readiness this week"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-medium tracking-[0.14em] uppercase text-muted-foreground">
          Inner Readiness · this week
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <svg viewBox={`0 0 ${W} ${H}`} width="160" height="92" aria-hidden>
            <path d={arcPath(aStart, aStart + seg)} stroke={tierColor.red} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'red' ? 1 : 0.28} />
            <path d={arcPath(aStart + seg, aStart + 2 * seg)} stroke={tierColor.amber} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'amber' ? 1 : 0.28} />
            <path d={arcPath(aStart + 2 * seg, aEnd)} stroke={tierColor.green} strokeWidth={STROKE} fill="none" strokeLinecap="round" opacity={todayTier === 'green' ? 1 : 0.28} />
            {todayScore !== null && (
              <>
                <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="hsl(var(--foreground))" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={CX} cy={CY} r={4} fill="hsl(var(--foreground))" />
              </>
            )}
            <text x={CX} y={CY - 22} textAnchor="middle" className="font-headline" fontSize="28" fill="hsl(var(--foreground))">
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
            Resets every Monday. Tap for your full trajectory.
          </p>
        </div>
      </div>
    </button>
  );
};

export default InnerReadinessDial;