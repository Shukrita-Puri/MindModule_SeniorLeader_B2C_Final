import { useEffect, useRef, useState, useCallback } from 'react';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

type LevelField = 'clarity_level' | 'mental_sharpness_level' | 'confidence_level';

export type LevelVocabulary = {
  5: string;
  4: string;
  3: string;
  2: string;
  1: string;
};

interface LevelTrendCalendarProps {
  userId?: string;
  field: LevelField;
  title: string;
  explanation: string;
  /**
   * Per-trend slider vocabulary (mirrors /check-in-detail). When provided,
   * overrides the generic tier labels for both the legend and dot tooltip.
   */
  vocabulary?: LevelVocabulary;
}

interface DayCell {
  date: string;
  dayLabel: string;
  dateNum: string;
  isToday: boolean;
  isFuture: boolean;
  slots: {
    morning: { value: number | null };
    midday: { value: number | null };
    evening: { value: number | null };
  };
}

// Tier mapping for the 1–5 slider scale used in the detailed Check-in page.
// Palette is locked to the daily check-in outcome accents so the trend dots,
// outcome buttons, and Mental Energy Trend all share one visual language.
//   5 Peak     → Focused-blue   #3d6fa8
//   4 Strong   → Steady-green   #7ba87a
//   3 Steady   → Scattered-gold #d4b75a
//   2 Low      → Drained-amber  #e88a52
//   1 Depleted → Overloaded-red #d8553f
const LEVEL_TIERS: { value: number; color: string; dark: string; glow: string; label: string }[] = [
  { value: 5, color: '#3d6fa8', dark: '#2f5685', glow: 'rgba(61, 111, 168, 0.35)',  label: 'Peak' },
  { value: 4, color: '#7ba87a', dark: '#5f8a5e', glow: 'rgba(123, 168, 122, 0.35)', label: 'Strong' },
  { value: 3, color: '#d4b75a', dark: '#b89a3f', glow: 'rgba(212, 183, 90, 0.35)',  label: 'Steady' },
  { value: 2, color: '#e88a52', dark: '#c76d38', glow: 'rgba(232, 138, 82, 0.35)',  label: 'Low' },
  { value: 1, color: '#d8553f', dark: '#b03d2a', glow: 'rgba(216, 85, 63, 0.35)',   label: 'Depleted' },
];

const tierFor = (v: number | null) => {
  if (v == null) return null;
  // Clamp 1–5 (defensive against any legacy 6–10 values: collapse into Peak).
  const clamped = Math.max(1, Math.min(5, Math.round(v)));
  return LEVEL_TIERS.find((t) => t.value === clamped) || null;
};

const LevelTrendCalendar = ({ userId, field, title, explanation, vocabulary }: LevelTrendCalendarProps) => {
  const [days, setDays] = useState<DayCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef<DayCell[] | null>(null);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  daysRef.current = days;

  const labelFor = (value: number) =>
    vocabulary?.[value as 1 | 2 | 3 | 4 | 5] ??
    LEVEL_TIERS.find((t) => t.value === value)?.label ??
    '';

  // Self-healing layout: re-pin column widths AND re-apply auto-scroll on
  // every render / resize. Mirrors the ref-callback pattern used by Energy
  // Trend in PerformanceRhythmCard so the strip can never collapse to 0px
  // when clientWidth is briefly stale on mount.
  const applyLayout = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const days = daysRef.current;
    if (!days || days.length === 0) return;
    const mobile = isMobileRef.current;
    if (mobile) {
      const colW = Math.floor(el.clientWidth / 7);
      if (colW > 0) {
        el.querySelectorAll('[data-day-col]').forEach((c) => {
          (c as HTMLElement).style.width = `${colW}px`;
          (c as HTMLElement).style.minWidth = `${colW}px`;
        });
      }
    }
    const todayIdx = days.findIndex((d) => d.isToday);
    if (todayIdx >= 0) {
      const todayDate = new Date(days[todayIdx].date);
      const dow = todayDate.getDay();
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const mondayIdx = Math.max(0, todayIdx - mondayOffset);
      const colWidth = mobile ? Math.floor(el.clientWidth / 7) : 27;
      const scrollTo = mondayIdx * colWidth;
      if (scrollTo > 0) {
        setTimeout(() => { el.scrollLeft = scrollTo; }, 80);
      }
    }
  }, []);

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollElRef.current = el;
    applyLayout(el);
  }, [applyLayout]);

  // ResizeObserver belt-and-braces: re-pin on viewport / sidebar / orientation changes.
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => applyLayout(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLayout, days]);

  useEffect(() => {
    if (!userId && !DEV_MODE) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Full current calendar month (day 1 → last day of month). This mirrors
        // the Energy Trend strip exactly so all four calendars share the same
        // date range and "remaining days/weeks" rendering (future days are
        // shown as dashed-empty cells).
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toLocaleDateString('en-CA');
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const monthEnd = new Date(currentYear, currentMonth + 1, 0);
        const startDate = monthStart.toLocaleDateString('en-CA');
        const endDate = monthEnd.toLocaleDateString('en-CA');

        const accessToken = DEV_MODE ? null : await getAuthToken();
        if (!DEV_MODE && !accessToken) {
          if (!cancelled) { setDays([]); setLoading(false); }
          return;
        }

        // Production must go through the `level-trend-calendar` Edge Function:
        // Auth0 tokens cannot satisfy `auth.uid()` in Postgres, so a direct
        // client query against `daily_checkins` is denied by RLS and returns
        // zero rows for every authenticated user. The Edge Function verifies
        // the Auth0 JWT server-side and reads with the service role.
        // DEV_MODE keeps the direct query (dev RLS allows it).
        let data: Array<{ checkin_date: string; time_window: string; created_at: string; value: number }> = [];
        if (DEV_MODE) {
          const { data: rows, error } = await supabase
            .from('daily_checkins')
            .select(`checkin_date, time_window, created_at, ${field}`)
            .eq('user_id', DEV_USER.id)
            .gte('checkin_date', startDate)
            .lte('checkin_date', endDate);
          if (error) throw error;
          data = (rows || []).map((row: any) => ({
            checkin_date: row.checkin_date,
            time_window: row.time_window,
            created_at: row.created_at,
            value: row[field],
          }));
        } else {
          const { data: result, error } = await supabase.functions.invoke('level-trend-calendar', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { field, startDate, endDate },
          });
          if (error) throw error;
          data = (result?.rows || []) as typeof data;
        }

        // Index latest non-null value per (date, slot). 'afternoon' → 'midday'.
        const idx: Record<string, Record<string, { v: number; t: number }>> = {};
        data.forEach((row) => {
          const v = row.value;
          if (v == null) return;
          const tw = (row.time_window || '').toLowerCase();
          const slot = tw === 'afternoon' ? 'midday' : tw;
          if (!['morning', 'midday', 'evening'].includes(slot)) return;
          const t = row.created_at ? new Date(row.created_at).getTime() : 0;
          const dayMap = idx[row.checkin_date] || (idx[row.checkin_date] = {});
          if (!dayMap[slot] || t >= dayMap[slot].t) {
            dayMap[slot] = { v, t };
          }
        });

        // Walk day 1 → last day of the current calendar month.
        const totalDays = monthEnd.getDate();
        const out: DayCell[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(currentYear, currentMonth, i + 1);
          const dateStr = d.toLocaleDateString('en-CA');
          const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
          const dateNum = String(d.getDate());
          const isToday = dateStr === todayStr;
          const isFuture = d.getTime() > today.getTime();
          out.push({
            date: dateStr,
            dayLabel,
            dateNum,
            isToday,
            isFuture,
            slots: {
              morning: { value: idx[dateStr]?.morning?.v ?? null },
              midday: { value: idx[dateStr]?.midday?.v ?? null },
              evening: { value: idx[dateStr]?.evening?.v ?? null },
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

  // After data arrives, re-apply layout once we know the strip element exists.
  useEffect(() => {
    applyLayout(scrollElRef.current);
  }, [days, isMobile, applyLayout]);

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">{title}</span>
          <InsightInfoModal title={title} explanation={explanation} />
        </div>
        <span className="text-xs text-muted-foreground/50">← scroll for past weeks</span>
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
          ref={setScrollRef}
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
                      style={hasValue && tier ? {
                        background: `linear-gradient(135deg, ${tier.color}, ${tier.dark})`,
                        boxShadow: `0 2px 6px ${tier.glow}`,
                      } : undefined}
                      title={slot.value != null && tier ? `${labelFor(tier.value)} (${slot.value}/5)` : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend — uses the slider vocabulary from /check-in-detail when provided */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-3 border-t border-border/20">
        {LEVEL_TIERS.slice().reverse().map((tier) => (
          <div key={tier.value} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full shadow-sm"
              style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.dark})` }}
            />
            <span>{labelFor(tier.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LevelTrendCalendar;
