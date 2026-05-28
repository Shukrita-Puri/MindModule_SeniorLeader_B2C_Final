import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfMonth, subDays } from 'date-fns';
import { computeDimensionStreaks, type DimensionStreak, type MonthlyCheckin } from '@/utils/dimensionTiers';
import { cn } from '@/lib/utils';

const ChipRow = ({ s, kind }: { s: DimensionStreak; kind: 'peak' | 'friction' }) => {
  const Icon = kind === 'peak' ? ThumbsUp : ThumbsDown;
  const tint = kind === 'peak' ? 'hsl(142 55% 42%)' : 'hsl(8 75% 55%)';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="relative flex items-center justify-center w-9 h-9 rounded-full"
        style={{ background: `${tint}14`, color: tint }}
      >
        <Icon className="w-4 h-4" strokeWidth={2.2} />
        <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center text-white" style={{ background: tint }}>
          {s.count}
        </span>
      </span>
      <span className="text-[14px] text-foreground font-body">{s.label}</span>
    </div>
  );
};

const PerformanceStreaks = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = DEV_MODE ? DEV_USER.id : user?.id;
  const [streaks, setStreaks] = useState<{ peaks: DimensionStreak[]; frictions: DimensionStreak[] }>({ peaks: [], frictions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const baselineStart = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('daily_checkins')
        .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
        .eq('user_id', uid)
        .gte('checkin_date', baselineStart)
        .order('checkin_date', { ascending: true });
      const all = (data as MonthlyCheckin[]) || [];
      const monthly = all.filter(c => c.checkin_date >= monthStart);
      setStreaks(computeDimensionStreaks(all, monthly));
      setLoading(false);
    })();
  }, [uid]);

  if (loading) return null;
  if (streaks.peaks.length === 0 && streaks.frictions.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/insights/performance-rhythm')}
      className={cn(
        'w-full text-left rounded-2xl bg-white/65 backdrop-blur-[30px] backdrop-saturate-150',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'transition-transform duration-200 active:scale-[0.99]',
        'px-5 pt-4 pb-4',
      )}
      aria-label="Performance streaks this month"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium tracking-[0.14em] uppercase text-muted-foreground">
          Performance Streaks · this month
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground/80 mb-1">Peak</p>
          {streaks.peaks.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">Gathering data</p>
          ) : (
            streaks.peaks.map(s => <ChipRow key={s.dimension} s={s} kind="peak" />)
          )}
        </div>
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground/80 mb-1">Friction</p>
          {streaks.frictions.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">Gathering data</p>
          ) : (
            streaks.frictions.map(s => <ChipRow key={s.dimension} s={s} kind="friction" />)
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-3 leading-snug">
        Counts reset on the 1st. Quartiles use your own 90-day baseline.
      </p>
    </button>
  );
};

export default PerformanceStreaks;