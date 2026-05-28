import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfMonth, subDays } from 'date-fns';
import { computeDimensionStreaks, type DimensionStreak, type MonthlyCheckin } from '@/utils/dimensionTiers';
import { cn } from '@/lib/utils';

const SHORT_LABEL: Record<string, string> = {
  clarity: 'Clarity',
  emotion: 'Emotion',
  pressure: 'Pressure',
  regulation: 'Regulation',
};

const Cell = ({ s, kind }: { s: DimensionStreak; kind: 'peak' | 'friction' }) => {
  const Icon = kind === 'peak' ? ThumbsUp : ThumbsDown;
  const tint = kind === 'peak' ? 'hsl(142 55% 42%)' : 'hsl(8 75% 55%)';
  const dim = s.count === 0;
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span
        className="relative flex items-center justify-center w-9 h-9 rounded-full"
        style={{
          background: dim ? 'hsl(var(--muted) / 0.4)' : `${tint}14`,
          color: dim ? 'hsl(var(--muted-foreground))' : tint,
          opacity: dim ? 0.55 : 1,
        }}
      >
        <Icon className="w-4 h-4" strokeWidth={2.2} />
        <span
          className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center text-white"
          style={{ background: dim ? 'hsl(var(--muted-foreground))' : tint }}
        >
          {s.count}
        </span>
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate max-w-full">
        {SHORT_LABEL[s.dimension] ?? s.dimension}
      </span>
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
      {/* Peak row */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground/80 w-16 flex-shrink-0">Peak</span>
        <div className="grid grid-cols-4 gap-2 flex-1">
          {streaks.peaks.map(s => <Cell key={s.dimension} s={s} kind="peak" />)}
        </div>
      </div>
      {/* Friction row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground/80 w-16 flex-shrink-0">Friction</span>
        <div className="grid grid-cols-4 gap-2 flex-1">
          {streaks.frictions.map(s => <Cell key={s.dimension} s={s} kind="friction" />)}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-3 leading-snug">
        Counts reset on the 1st. Quartiles use your own 90-day baseline.
      </p>
    </button>
  );
};

export default PerformanceStreaks;