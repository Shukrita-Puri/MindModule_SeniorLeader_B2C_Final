import { useEffect, useRef, useState } from 'react';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

type LevelField = 'clarity_level' | 'mental_sharpness_level' | 'confidence_level';

interface LevelTrendCalendarProps {
  userId?: string;
  field: LevelField;
  title: string;
  explanation: string;
}

interface DaySlot { value: number | null; }
interface DayCell {
  date: string;
  dayLabel: string;
  dateNum: string;
  isToday: boolean;
  isFuture: boolean;
  slots: { morning: DaySlot; midday: DaySlot; evening: DaySlot };
}

// Map a 1–10 level to a graded gradient + glow.
// We mirror the Mental Energy Trend visual language: deep saturated tones for the
// "best" end of the scale, muted/dim for the low end, neutral for missing data.
const LEVEL_TIERS: { min: number; gradient: string; glow: string; label: string }[] = [
  { min: 9, gradient: 'from-emerald-800 to-emerald-600', glow: 'rgba(6, 95, 70, 0.35)', label: 'Peak' },
  { min: 7, gradient: 'from-blue-900 to-blue-700', glow: 'rgba(30, 58, 138, 0.35)', label: 'Strong' },
  { min: 5, gradient: 'from-slate-700 to-slate-500', glow: 'rgba(51, 65, 85, 0.35)', label: 'Steady' },
  { min: 3, gradient: 'from-amber-800 to-amber-600', glow: 'rgba(146, 64, 14, 0.35)', label: 'Low' },
  { min: 1, gradient: 'from-red-900 to-red-700', glow: 'rgba(127, 29, 29, 0.35)', label: 'Depleted' },
];

const tierFor = (v: number | null) => {
  if (v == null) return null;
  return LEVEL_TIERS.find((t) => v >= t.min) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
};

const LevelTrendCalendar = ({ userId, field, title, explanation }: LevelTrendCalendarProps) => {
  const [days, setDays] = useState<DayCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userId && !DEV_MODE) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Build current Mon → Sun window (local).
        const today = new Date();
        const todayStr = today.toLocaleDateString('en-CA');
        const dow = today.getDay();
        const daysFromMonday = dow === 0 ? 6 : dow - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const startDate = monday.toLocaleDateString('en-CA');
        const endDate = sunday.toLocaleDateString('en-CA');

        const accessToken = DEV_MODE ? null : await getAuthToken();
        if (!DEV_MODE && !accessToken) {
          if (!cancelled) { setDays([]); setLoading(false); }
          return;
        }

        let q = supabase
          .from('daily_checkins')
          .select(`checkin_date, time_window, ${field}`)
          .gte('checkin_date', startDate)
          .lte('checkin_date', endDate);
        if (DEV_MODE) q = q.eq('user_id', DEV_USER.id);
        const { data, error } = await q;
        if (error) throw error;

        // Index latest non-null value per (date, window).
        const idx: Record<string, Record<string, number>> = {};
        (data || []).forEach((row: any) => {
          const v = row[field];
          if (v == null) return;
          const tw = (row.time_window || '').toLowerCase();
          // map standard windows → display slots (morning / midday / evening)
          const slot = tw === 'afternoon' ? 'midday' : tw;
          if (!['morning', 'midday', 'evening'].includes(slot)) return;
          idx[row.checkin_date] = idx[row.checkin_date] || {};
          idx[row.checkin_date][slot] = v;
        });

        const out: DayCell[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const dateStr = d.toLocaleDateString('en-CA');
          const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
          const dateNum = String(d.getDate());
          const isToday = dateStr === todayStr;
          const isFuture = d > today && !isToday;
          out.push({
            date: dateStr,
            dayLabel,
            dateNum,
            isToday,
            isFuture,
            slots: {
              morning: { value: idx[dateStr]?.morning ?? null },
              midday: { value: idx[dateStr]?.midday ?? null },
              evening: { value: idx[dateStr]?.evening ?? null },
            },
          });
        }
        if (!cancelled) setDays(out);
      } catch (err) {
        console.error('[LevelTrendCalendar]', field, 'error:', err);
        if (!cancelled) setDays([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, field]);

  // Equal-width columns on mobile to mirror Mental Energy Trend layout.
  useEffect(() => {
    if (!days || !scrollRef.current || !isMobile) return;
    const el = scrollRef.current;
    const colW = Math.floor(el.clientWidth / 7);
    el.querySelectorAll('[data-day-col]').forEach((c) => {
      (c as HTMLElement).style.width = `${colW}px`;
      (c as HTMLElement).style.minWidth = `${colW}px`;
    });
  }, [days, isMobile]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">{title}</span>
        </div>
        <div className="h-[120px] rounded-md bg-muted/20 animate-pulse" />
      </div>
    );
  }

  if (!days || days.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">{title}</span>
          <InsightInfoModal title={title} explanation={explanation} />
        </div>
      </div>

      <div className="flex">
        {/* Fixed row labels */}
        <div className="flex flex-col gap-1.5 mr-2.5 pt-[38px]">
          {['Morning', 'Midday', 'Evening'].map((label) => (
            <div key={label} className="h-[22px] flex items-center justify-end">
              <span className="text-xs text-muted-foreground whitespace-nowrap w-[44px] text-right">{label}</span>
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="overflow-x-auto flex-1 pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            className="inline-flex"
            style={{ minWidth: 'max-content', gap: isMobile ? 0 : '4px' }}
          >
            {days.map((day) => (
              <div
                key={day.date}
                data-day-col
                className="flex flex-col items-center gap-1.5"
                style={{
                  width: isMobile ? undefined : '26px',
                  minWidth: isMobile ? undefined : '26px',
                  flexShrink: 0,
                }}
              >
                <div className="flex flex-col items-center h-[34px] justify-end pb-1">
                  <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                  <span className={cn('text-xs', day.isToday ? 'text-primary font-medium' : 'text-foreground/70')}>
                    {day.dateNum}
                  </span>
                </div>
                {(['morning', 'midday', 'evening'] as const).map((tw) => {
                  const slot = day.slots[tw];
                  const tier = tierFor(slot.value);
                  const hasValue = !!tier && !day.isFuture;
                  return (
                    <div
                      key={tw}
                      className={cn(
                        'w-[22px] h-[22px] rounded-full flex-shrink-0 relative overflow-hidden transition-all duration-200',
                        day.isFuture
                          ? 'border border-dashed border-border/40 bg-transparent'
                          : hasValue
                            ? 'shadow-sm'
                            : 'bg-white/90 dark:bg-white/15',
                        day.isToday && !day.isFuture && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
                      )}
                      style={hasValue && tier ? { boxShadow: `0 2px 6px ${tier.glow}` } : undefined}
                      title={slot.value != null ? `${slot.value}/10` : undefined}
                    >
                      {hasValue && tier && (
                        <div className={cn('absolute inset-0 bg-gradient-to-br', tier.gradient)} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelTrendCalendar;