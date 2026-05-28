import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfMonth, subDays } from 'date-fns';
import { computeDimensionStreaks, type DimensionStreak, type MonthlyCheckin } from '@/utils/dimensionTiers';
import { cn } from '@/lib/utils';
import { getAuthToken } from '@/services/authTokenService';

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
  const { user } = useAuth();
  const uid = DEV_MODE ? DEV_USER.id : user?.id;
  const [streaks, setStreaks] = useState<{ peaks: DimensionStreak[]; frictions: DimensionStreak[] }>({ peaks: [], frictions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      let rows: MonthlyCheckin[] = [];
      try {
        if (DEV_MODE) {
          const { data } = await supabase
            .from('daily_checkins')
            .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
            .eq('user_id', uid)
            .gte('checkin_date', monthStart)
            .order('checkin_date', { ascending: true });
          rows = (data as MonthlyCheckin[]) || [];
        } else {
          const token = await getAuthToken();
          if (token) {
            const { data } = await supabase.functions.invoke('daily-checkins', {
              headers: { Authorization: `Bearer ${token}` },
              body: { action: 'GET_MONTHLY_LEVELS', startDate: monthStart, endDate: today },
            });
            rows = (data?.data as MonthlyCheckin[]) || [];
          }
        }
      } catch (err) {
        console.error('[PerformanceStreaks] fetch failed:', err);
      }
      setStreaks(computeDimensionStreaks(rows, rows));
      setLoading(false);
    })();
  }, [uid]);

  if (loading) return null;

  return (
    <div
      role="group"
      aria-label="Performance streaks this month"
      className={cn(
        'w-full text-left rounded-2xl bg-white/65 backdrop-blur-[30px] backdrop-saturate-150',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'px-5 pt-4 pb-4',
      )}
    >
      <div className="mb-2">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-foreground">
          Your Performance Trajectory
        </span>
        <span className="block text-[11px] tracking-[0.12em] uppercase text-muted-foreground/80 mt-0.5">
          Performance Streak · This Month
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
        Counts reset on the 1st. Peak = any slot at level 4–5. Friction = any slot at level 1–2.
      </p>
    </div>
  );
};

export default PerformanceStreaks;