import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import StreakWreath from '@/components/insights/StreakWreath';
import ProgressiveUnlockMessage from '@/components/insights/ProgressiveUnlockMessage';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShareCapture } from '@/utils/shareCaptureMode';


type LevelField =
  | 'clarity_level'
  | 'mental_sharpness_level'
  | 'confidence_level'
  | 'emotion_level'
  | 'pressure_level'
  | 'regulation_level';

export type LevelVocabulary = {
  5: string;
  4: string;
  3: string;
  2: string;
  1: string;
};

export type LevelPalette =
  | 'sharpness'
  | 'clarity'
  | 'confidence'
  | 'emotion'
  | 'pressure'
  | 'regulation';

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
  /**
   * Single-hue ramp synced to the matching /check-in-detail slider gradient.
   * Falls back to the legacy traffic-light palette when omitted.
   */
  palette?: LevelPalette;
  /** Caption shown below the streak wreath (e.g. "days of crystal clarity"). */
  streakLabel?: string;
  /** Suppress the flame streak wreath entirely (used on Performance Rhythm tabs). */
  hideStreak?: boolean;
  /** Optional wider fetch window for sparse dimensions. */
  lookbackDays?: number;
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
// Each palette is a single-hue ramp synced to the matching slider gradient
// in /check-in-detail (see LUXURY_SPECTRUMS in components/ui/slider.tsx).
type Tier = { value: number; color: string; dark: string; glow: string; label: string };

const glow = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
};

const buildTiers = (
  ramp: { color: string; dark: string }[],
  labels: { 5: string; 4: string; 3: string; 2: string; 1: string },
): Tier[] =>
  // ramp[0] = lowest (level 1), ramp[4] = highest (level 5)
  [5, 4, 3, 2, 1].map((value) => {
    const stop = ramp[value - 1];
    return {
      value,
      color: stop.color,
      dark: stop.dark,
      glow: glow(stop.color),
      label: labels[value as 1 | 2 | 3 | 4 | 5],
    };
  });

// Default (legacy) traffic-light tier palette + labels.
const DEFAULT_TIERS: Tier[] = [
  { value: 5, color: '#3d6fa8', dark: '#2f5685', glow: 'rgba(61, 111, 168, 0.35)',  label: 'Peak' },
  { value: 4, color: '#7ba87a', dark: '#5f8a5e', glow: 'rgba(123, 168, 122, 0.35)', label: 'Strong' },
  { value: 3, color: '#d4b75a', dark: '#b89a3f', glow: 'rgba(212, 183, 90, 0.35)',  label: 'Steady' },
  { value: 2, color: '#e88a52', dark: '#c76d38', glow: 'rgba(232, 138, 82, 0.35)',  label: 'Low' },
  { value: 1, color: '#d8553f', dark: '#b03d2a', glow: 'rgba(216, 85, 63, 0.35)',   label: 'Depleted' },
];

// Single-hue ramps mirror the slider gradients (low → high = level 1 → 5).
const PALETTE_RAMPS: Record<LevelPalette, { color: string; dark: string }[]> = {
  sharpness: [
    { color: '#FFE082', dark: '#E6C975' }, // 1
    { color: '#FFD54F', dark: '#E6BF47' }, // 2
    { color: '#FFC107', dark: '#E6AE06' }, // 3
    { color: '#FFA000', dark: '#CC8000' }, // 4
    { color: '#B8860B', dark: '#8E6708' }, // 5
  ],
  clarity: [
    { color: '#B2EBF2', dark: '#8FD2DA' }, // 1
    { color: '#80DEEA', dark: '#5FBFCC' }, // 2
    { color: '#26C6DA', dark: '#1FA1B2' }, // 3
    { color: '#0097A7', dark: '#007581' }, // 4
    { color: '#006064', dark: '#003F42' }, // 5
  ],
  confidence: [
    { color: '#E0D4F5', dark: '#C4B3E8' }, // 1
    { color: '#B39DDB', dark: '#9685C2' }, // 2
    { color: '#7E57C2', dark: '#5E3FA0' }, // 3
    { color: '#3A1B82', dark: '#28115E' }, // 4
    { color: '#080226', dark: '#020010' }, // 5
  ],
  // Emotion: light blush → deep burgundy (mirrors /daily-check-in emotion slider)
  emotion: [
    { color: '#FBE4E8', dark: '#E8C7CD' }, // 1 Reactive
    { color: '#F2B8C2', dark: '#D89AA6' }, // 2 Unsettled
    { color: '#D87A8E', dark: '#B85F73' }, // 3 Balanced
    { color: '#9B3A52', dark: '#7A2A3E' }, // 4 Composed
    { color: '#5C1A2E', dark: '#3D0F1E' }, // 5 Open
  ],
  // Pressure: light amber → deep amber (heat/tension; light = Overloaded, dark = Spacious)
  pressure: [
    { color: '#FFE082', dark: '#E6C975' }, // 1 Overloaded
    { color: '#FFD54F', dark: '#E6BF47' }, // 2 Elevated
    { color: '#FFC107', dark: '#E6AE06' }, // 3 Manageable
    { color: '#FFA000', dark: '#CC8000' }, // 4 Light
    { color: '#B8860B', dark: '#8E6708' }, // 5 Spacious
  ],
  // Regulation: lavender → deep indigo (parasympathetic / calm control)
  regulation: [
    { color: '#E0D4F5', dark: '#C4B3E8' }, // 1 Reactive
    { color: '#B39DDB', dark: '#9685C2' }, // 2 Low
    { color: '#7E57C2', dark: '#5E3FA0' }, // 3 Holding
    { color: '#3A1B82', dark: '#28115E' }, // 4 Strong
    { color: '#080226', dark: '#020010' }, // 5 In Control
  ],
};

const tiersFor = (palette?: LevelPalette, vocabulary?: LevelVocabulary): Tier[] => {
  if (!palette) return DEFAULT_TIERS;
  const labels = vocabulary ?? { 5: 'Peak', 4: 'Strong', 3: 'Steady', 2: 'Low', 1: 'Depleted' };
  return buildTiers(PALETTE_RAMPS[palette], labels);
};

const tierFor = (tiers: Tier[], v: number | null) => {
  if (v == null) return null;
  // Clamp 1–5 (defensive against any legacy 6–10 values: collapse into Peak).
  const clamped = Math.max(1, Math.min(5, Math.round(v)));
  return tiers.find((t) => t.value === clamped) || null;
};

const MILESTONES = [3, 7, 14, 21, 30] as const;
type Milestone = (typeof MILESTONES)[number];

const LevelTrendCalendar = ({ userId, field, title, explanation, vocabulary, palette, streakLabel, hideStreak, lookbackDays }: LevelTrendCalendarProps) => {
  const LEVEL_TIERS = tiersFor(palette, vocabulary);
  const [days, setDays] = useState<DayCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const shareCapturing = useShareCapture();

  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef<DayCell[] | null>(null);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  daysRef.current = days;

  // ── Streak: consecutive days in the current calendar month, ending today
  // (or yesterday if today has no entry yet), where ANY slot for the day
  // hit the positive band (level ≥ 4). Resets on the 1st of each month.
  const streak = useMemo(() => {
    if (!days || days.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString('en-CA');
    const inMonth = days.filter((d) => !d.isFuture);
    const isPositive = (d: DayCell) =>
      [d.slots.morning.value, d.slots.midday.value, d.slots.evening.value].some(
        (v) => v != null && v >= 4,
      );
    const hasAny = (d: DayCell) =>
      [d.slots.morning.value, d.slots.midday.value, d.slots.evening.value].some((v) => v != null);
    let i = inMonth.length - 1;
    // If today exists and has no check-in yet, anchor at yesterday.
    if (i >= 0 && inMonth[i].date === todayStr && !hasAny(inMonth[i])) i -= 1;
    let count = 0;
    while (i >= 0 && isPositive(inMonth[i])) {
      count += 1;
      i -= 1;
    }
    return count;
  }, [days]);

  const lastStreakRef = useRef(0);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  useEffect(() => {
    const prev = lastStreakRef.current;
    if (streak > prev) {
      const hit = MILESTONES.find((m) => prev < m && streak >= m);
      if (hit) {
        setActiveMilestone(hit);
        const t = setTimeout(() => setActiveMilestone(null), 1400);
        return () => clearTimeout(t);
      }
    }
    lastStreakRef.current = streak;
  }, [streak]);

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
    // Exactly 7 day columns visible at every breakpoint (matches iOS).
    const colW = Math.floor(el.clientWidth / 7);
    if (colW > 0) {
      el.querySelectorAll('[data-day-col]').forEach((c) => {
        (c as HTMLElement).style.width = `${colW}px`;
        (c as HTMLElement).style.minWidth = `${colW}px`;
      });
    }
    const todayIdx = days.findIndex((d) => d.isToday);
    if (todayIdx >= 0 && colW > 0) {
      const todayDate = new Date(days[todayIdx].date);
      const dow = todayDate.getDay();
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const mondayIdx = Math.max(0, todayIdx - mondayOffset);
      const scrollTo = mondayIdx * colW;
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
    const windowDays = Math.max(7, Math.min(lookbackDays ?? 30, 30));

    const load = async (attempt: number): Promise<void> => {
      setLoading(true);
      try {
        // Fixed 30-day window ending today. The share export uses exactly the
        // same range, so the strip and the exported calendar always agree.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toLocaleDateString('en-CA');
        const firstVisible = new Date(today.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
        firstVisible.setHours(0, 0, 0, 0);
        const startDate = firstVisible.toLocaleDateString('en-CA');
        const endDate = todayStr;

        const accessToken = DEV_MODE ? null : await getAuthToken();
        if (!DEV_MODE && !accessToken) {
          throw new Error('auth-token-unavailable');
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
          data = (rows || []).map((row: Record<string, unknown>) => ({
            checkin_date: String(row.checkin_date ?? ''),
            time_window: String(row.time_window ?? ''),
            created_at: String(row.created_at ?? ''),
            value: typeof row[field] === 'number' ? (row[field] as number) : 0,
          }));
        } else {
          const { data: result, error } = await supabase.functions.invoke('level-trend-calendar', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { field, startDate, endDate, lookbackDays: windowDays },
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

        const out: DayCell[] = [];
        for (let i = 0; i < windowDays; i++) {
          const d = new Date(firstVisible.getTime() + i * 24 * 60 * 60 * 1000);
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
        // A failed request / missing auth token is NOT "no data" — keep any
        // previously loaded days and retry once before showing an empty state.
        if (cancelled) return;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 900));
          if (cancelled) return;
          return load(1);
        }
        if (daysRef.current == null) setDays([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(0);
    return () => { cancelled = true; };
  }, [userId, field, lookbackDays]);

  // After data arrives, re-apply layout once we know the strip element exists.
  // Also re-runs when a share capture ends, because the capture clears the
  // pinned inline column widths and would otherwise leave the strip parked
  // on an earlier week.
  useEffect(() => {
    applyLayout(scrollElRef.current);
  }, [days, isMobile, applyLayout, shareCapturing]);


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

  const hasAnyData = !!days?.some(
    (d) => d.slots.morning.value !== null || d.slots.midday.value !== null || d.slots.evening.value !== null,
  );

  if (!days || days.length === 0 || !hasAnyData) {
    return (
      <div className="space-y-3">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">
          {title}
        </span>
        <ProgressiveUnlockMessage
          currentCount={0}
          unlockAt={3}
          featureName={title}
          previewText="No data yet for this dimension in the selected period. Check in to start building your trend."
        />
      </div>
    );
  }

  // Export layout: while a share snapshot is being taken, the SAME 30-day
  // window renders as compact Monday-aligned month blocks so the whole range
  // fits a portrait image (no horizontal scrolling for the recipient).
  // Every loaded day appears exactly once, under its true weekday column.
  if (shareCapturing) {
    const blocks: { key: string; label: string; grid: (DayCell | null)[] }[] = [];
    for (const day of days) {
      const d = new Date(`${day.date}T00:00:00`);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let block = blocks.find((b) => b.key === key);
      if (!block) {
        block = {
          key,
          label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          grid: [],
        };
        // Leading blanks: real weekday of this block's first rendered day,
        // Monday-indexed (Sunday → 6).
        const dow = d.getDay();
        const mondayIdx = (dow + 6) % 7;
        for (let i = 0; i < mondayIdx; i++) block.grid.push(null);
        blocks.push(block);
      }
      block.grid.push(day);
    }
    blocks.forEach((b) => {
      const trailing = (7 - (b.grid.length % 7)) % 7;
      for (let i = 0; i < trailing; i++) b.grid.push(null);
    });

    return (
      <div className="space-y-3">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">{title}</span>
        {blocks.map((block) => (
          <div key={block.key} className="space-y-1">
            <span className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground/80">
              {block.label}
            </span>
            <div className="grid grid-cols-7 gap-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div key={label} className="text-[9px] text-muted-foreground text-center pb-1">
                  {label}
                </div>
              ))}
              {block.grid.map((day, idx) => {
                if (!day) return <div key={`blank-${block.key}-${idx}`} className="h-12" />;
                const hasAny =
                  day.slots.morning.value !== null ||
                  day.slots.midday.value !== null ||
                  day.slots.evening.value !== null;
                return (
                  <div
                    key={day.date}
                    className={cn(
                      'h-12 rounded-md p-1 flex flex-col gap-0.5 overflow-hidden',
                      day.isFuture
                        ? 'border border-dashed border-border/40 bg-transparent'
                        : hasAny
                          ? 'bg-white'
                          : 'border border-foreground/40 bg-white',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[9px] leading-none',
                        day.isToday ? 'text-primary font-semibold' : 'text-muted-foreground',
                      )}
                    >
                      {day.dateNum}
                    </span>
                    <div className="flex-1 flex flex-col gap-px rounded-sm overflow-hidden">
                      {(['morning', 'midday', 'evening'] as const).map((tw) => {
                        const tier = tierFor(LEVEL_TIERS, day.slots[tw].value);
                        return (
                          <div
                            key={tw}
                            className="flex-1 w-full"
                            style={tier ? { background: `linear-gradient(135deg, ${tier.color}, ${tier.dark})` } : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/20">
          {['Morning', 'Midday', 'Evening'].map((label) => (
            <span key={label} className="flex items-center gap-1">
              <span className="h-1 w-4 rounded-full bg-foreground/30" />
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {LEVEL_TIERS.slice().reverse().map((tier) => (
            <div key={tier.value} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.dark})` }}
              />
              <span>{labelFor(tier.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const firstDay = days[0] ? new Date(`${days[0].date}T00:00:00`) : null;
  const lastDay = days[days.length - 1] ? new Date(`${days[days.length - 1].date}T00:00:00`) : null;
  const rangeLabel = firstDay && lastDay
    ? firstDay.getMonth() === lastDay.getMonth()
      ? firstDay.toLocaleDateString('en-US', { month: 'long' })
      : `${firstDay.toLocaleDateString('en-US', { month: 'short' })} – ${lastDay.toLocaleDateString('en-US', { month: 'short' })}`
    : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">{title}</span>
          <InsightInfoModal title={title} explanation={explanation} />
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{rangeLabel}</span>
          <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">← scroll</span>
        </div>
        {!hideStreak && (
          <div className="flex-shrink-0">
            <StreakWreath
              count={streak}
              label={streak > 0 ? (streakLabel ?? 'day streak') : 'start your streak'}
              milestone={activeMilestone}
            />
          </div>
        )}
      </div>


      <div className="flex">
        {/* Fixed row labels */}
        <div className="flex flex-col gap-1.5 mr-2.5 pt-[38px]">
          {['Morning', 'Midday', 'Evening'].map((label) => (
            <div key={label} className="h-9 flex items-center justify-end">
              <span className="text-xs text-muted-foreground whitespace-nowrap w-[44px] text-right">{label}</span>
            </div>
          ))}
        </div>

        <div
          ref={setScrollRef}
          className="overflow-x-auto flex-1 pb-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            className="inline-flex"
            style={{ minWidth: 'max-content', gap: 0 }}
          >
            {days.map((day) => (
              <div
                key={day.date}
                data-day-col
                className="flex flex-col items-center gap-1.5 px-[2px]"
                style={{ flexShrink: 0 }}
              >
                <div className="flex flex-col items-center h-[34px] justify-end pb-1">
                  <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                  <span className={cn('text-xs', day.isToday ? 'text-primary font-medium' : 'text-foreground/70')}>
                    {day.dateNum}
                  </span>
                </div>
                {(['morning', 'midday', 'evening'] as const).map((tw) => {
                  const slot = day.slots[tw];
                  const tier = tierFor(LEVEL_TIERS, slot.value);
                  const hasValue = !!tier && !day.isFuture;
                  return (
                    <div
                      key={tw}
                      className={cn(
                        'w-full h-9 rounded-md flex-shrink-0 relative overflow-hidden transition-all duration-200',
                        day.isFuture
                          ? 'border border-dashed border-border/40 bg-transparent'
                          : hasValue
                            ? 'shadow-sm'
                            : 'border border-border/60 bg-white/90 dark:bg-white/15',
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
              className="w-3 h-2.5 rounded-sm shadow-sm"
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
