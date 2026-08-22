/* eslint-disable no-restricted-syntax -- grandfathered raw calendar_events reads. Tracked in .lovable/plan.md for wiring through mergeCalendarEvents(). Remove this directive once every .from('calendar_events') read below has been replaced. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Calendar, AlertTriangle, Sparkles, ArrowRight, ChevronDown } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import InsightShareSlot from '@/components/insights/InsightShareSlot';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import LevelTrendCalendar from '@/components/insights/LevelTrendCalendar';
import StreakWreath from '@/components/insights/StreakWreath';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import SegmentedToggle from '@/components/insights/SegmentedToggle';

interface HeatmapCell {
  outcome: string | null;
  compositeScore: number | null;
  divergence: boolean;
}

interface WeekDay {
  date: string;
  dayLabel: string;
  dateNum: string; // e.g. "24"
  isToday: boolean;
  isFuture: boolean;
  slots: {
    morning: { outcome: string | null };
    midday: { outcome: string | null };
    evening: { outcome: string | null };
  };
}

interface WeekRow {
  weekLabel: string;
  startDate: string;
  days: WeekDay[];
}
interface BestReadinessWindow {
  timeWindow: number;
  day: number;
  avgScore: number;
  label: string;
}

interface PerformanceRhythmData {
  // Legacy presence fields — fully retired. Kept on the type for back-compat
  // with any cached server response that still carries them; never rendered.
  presenceScore?: number | null;
  presenceLabel?: string | null;
  presenceInsight?: string | null;
  presenceActions?: string[] | null;
  temporalPatterns?: string[] | null;

  // v3.1 — Your Rhythm Signals: prioritised top-3 from the 4-series rhythm
  // miner (Energy / Clarity / Sharpness / Confidence). `all` is the full
  // ranked set, retained so the weekly insights email can use the long form
  // without a second fetch.
  mindRhythmPatterns?: {
    topThree: RhythmFinding[];
    all: RhythmFinding[];
  } | null;

  // v3 — positive-rate stat surfaced inline (also exposed by state-patterns).
  positiveRate?: { pct: number; n: number } | null;

  /**
   * v4 — flat performance-lift projection from causality_findings.signal_summary
   * (written by cause-effect-engine). Drives the three new chart blocks under
   * Performance Patterns. Null for new users — blocks gate gracefully.
   */
  performanceLift?: PerformanceLift | null;

  /**
   * v6 — gate-failure diagnostics from cause-effect-engine. Lets the UI
   * render a data-honest "Awaiting …" line when a Performance Lift block
   * is null instead of a silent gap.
   */
  performanceDiagnostics?: PerformanceDiagnostics | null;

  calendarInsight: string | null;
  causeEffectInsight: string | null;
  grid: HeatmapCell[][];
  weekRows?: WeekRow[];
  bestReadinessWindow: BestReadinessWindow | null;
  checkInCount: number;
  behaviorLogCount: number;
  hasCalendar: boolean;
  dataSourceNote: string;
  // Backward compat
  heatmap?: Record<string, Record<string, HeatmapCell>>;
  bestWindow?: string | null;
  observations?: string[];
}

import type { RhythmFinding } from '@/lib/insights/patternSentences';
import {
  buildSection,
  CHECK_IN_DIMS as CHECK_IN_DIM_SET,
  DIM_LABELS as RHYTHM_DIM_LABELS,
  EMPTY_STATE,
  NO_DATA_STATE,
  EARLY_PATTERN_NOTE,
} from '@/lib/insights/patternSentences';

/**
 * Internal reliability audit — never user-visible. Off by default; enabled
 * only by manually setting `localStorage.patternDebug = '1'` (dev/support).
 */
const isPatternDebugEnabled = (_userId?: string | null): boolean => {
  try {
    return localStorage.getItem('patternDebug') === '1';
  } catch {
    return false;
  }
};


type LiftConfidence = 'strong' | 'emerging';
type LiftWindow = 'morning' | 'afternoon' | 'evening';
interface PerformanceLift {
  hr_event_lift: Array<{
    eventTypeId: string;
    bucket: string;
    categoryId: string;
    categoryName: string;
    hrDeltaBpm: number;
    compositeLift: number;
    n: number;
    confidence: LiftConfidence;
    lastSeen: string;
  }>;
  category_lift: Array<{
    categoryId: string;
    categoryName: string;
    hrDeltaBpm: number;
    compositeLift: number;
    n: number;
    confidence: LiftConfidence;
  }>;
  sleep_to_peak: { deltaPct: number; n: number; confidence: LiftConfidence; bestWindow: LiftWindow | null } | null;
  rhr_recovery_window: { window: LiftWindow; liftPct: number; n: number; confidence: LiftConfidence } | null;
  recovery_streak_to_peak: { avgStreakLength: number; n: number; confidence: LiftConfidence } | null;
  generatedAt: string;
}

type GateReason =
  | 'ok'
  | 'no_sleep_score_rows'
  | 'insufficient_sleep_days'
  | 'no_prs_baseline'
  | 'insufficient_next_day_prs'
  | 'no_rhr_rows'
  | 'insufficient_rhr_days'
  | 'no_recovered_days_after_filter'
  | 'bucket_below_min_occurrences'
  | 'no_positive_lift'
  | 'no_hr_samples'
  | 'no_resting_baseline'
  | 'no_event_day_overlap'
  | 'all_subtypes_below_min_occurrences'
  | 'all_categories_below_min_occurrences';

interface PerformanceDiagnostics {
  gateReasons: {
    sleep_to_peak: GateReason;
    rhr_recovery_window: GateReason;
    hr_event_lift: GateReason;
    category_lift: GateReason;
  };
}

interface PerformanceRhythmCardProps {
  userId?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_LABELS = ['Morning', 'Afternoon', 'Evening'];

// Palette locked to the daily check-in outcome accents so the trend dots,
// outcome buttons, and Level (Clarity/Sharpness/Confidence) calendars all
// share one visual language.
const stateColors: Record<string, { color: string; dark: string; glow: string; label: string }> = {
  overwhelmed: {
    color: '#B8C7F0', dark: '#9AAEE6',
    glow: 'rgba(184, 199, 240, 0.35)',
    label: 'Overloaded',
  },
  drained: {
    color: '#7A93E0', dark: '#5E78CC',
    glow: 'rgba(122, 147, 224, 0.35)',
    label: 'Drained',
  },
  scattered: {
    color: '#3F54B8', dark: '#2F4196',
    glow: 'rgba(63, 84, 184, 0.35)',
    label: 'Scattered',
  },
  steady: {
    color: '#16205C', dark: '#0E1742',
    glow: 'rgba(22, 32, 92, 0.35)',
    label: 'Steady',
  },
  focused: {
    color: '#02061F', dark: '#000010',
    glow: 'rgba(2, 6, 31, 0.5)',
    label: 'Focused',
  },
};

// ── v4 Performance Lift sub-component ─────────────────────────────────
// Three blocks under "Performance Patterns" — Sleep → Peak, Recovery →
// Best Window, Categories Where You Thrive. All values are pre-baked by
// cause-effect-engine; this component only renders.
function windowLabel(w: 'morning' | 'afternoon' | 'evening' | null | undefined): string {
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// Collapsed to plain text lines (no charts, no "awaiting data" placeholders).
// Card scope is POSITIVE-ONLY (spec 3): drains, costs and non-positive deltas
// never render here. Empty array = render nothing.
function buildBaselineLiftLines(lift: PerformanceLift | null, hasCalendar: boolean): string[] {
  if (!lift) return [];
  const lines: string[] = [];
  const sleep = lift.sleep_to_peak;
  const rec = lift.rhr_recovery_window;
  const streak = lift.recovery_streak_to_peak;

  if (sleep && sleep.deltaPct > 0) {
    lines.push(
      `On your best-sleep nights, next-day readiness runs +${sleep.deltaPct}% above baseline${sleep.bestWindow ? ` — peaking in the ${windowLabel(sleep.bestWindow).toLowerCase()}` : ''}.`,
    );
  }
  if (rec && rec.liftPct > 0) {
    lines.push(
      `On well-recovered days your ${windowLabel(rec.window).toLowerCase()} leads by +${rec.liftPct}%.`,
    );
  }
  if (streak && streak.avgStreakLength > 0) {
    lines.push(
      `Your peak days typically follow ${streak.avgStreakLength} consecutive low-RHR day${streak.avgStreakLength === 1 ? '' : 's'}.`,
    );
  }
  if (hasCalendar) {
    const thriving = lift.category_lift.filter((c) => c.compositeLift > 0).slice(0, 2);
    if (thriving.length > 0) {
      lines.push(
        `You thrive in ${thriving.map((c) => c.categoryName).join(' and ')} — readiness lifts +${thriving[0].compositeLift}% on those days.`,
      );
    }
  }
  return lines;
}


const CHECK_IN_DIMS = CHECK_IN_DIM_SET;
const DIM_LABELS = RHYTHM_DIM_LABELS;

/** Reliability audit — traces one rendered sentence back to its raw observations. */
const PatternDebugRow = ({ row }: { row: { text: string; tier: string; dimension: string; finding: RhythmFinding } }) => {
  const s = row.finding.stats;
  return (
    <li className="text-[10px] font-mono text-muted-foreground/80 leading-relaxed break-words">
      <span className="text-foreground/70">{row.dimension}</span>
      {' · '}{row.finding.kind}{' · '}tier={row.tier}{' · '}n={s?.n ?? 0}
      {' · '}best={s?.bestPct ?? '—'}%{' vs '}{s?.comparePct ?? '—'}%
      {' · '}gap={s?.gapPp ?? '—'}pp{' · '}src={s?.source ?? '—'}{' · '}pol={s?.polarity ?? '—'}
      {s?.runLength ? ` · run=${s.runLength}` : ''}
      <br />
      dates: {(s?.dates ?? []).join(', ') || '—'}
      {s?.rawValues?.length ? <> <br />values: {s.rawValues.map((v) => Math.round(v * 10) / 10).join(', ')}</> : null}
      <br />
      out: {row.text}
    </li>
  );
};


const PatternLine = ({ text, dim }: { text: string; dim?: string }) => (
  <li className="text-xs text-foreground/85 leading-relaxed flex items-start gap-2">
    <ArrowRight className="h-3 w-3 text-primary/60 flex-shrink-0 mt-0.5" />
    <span>
      {text}
      {dim && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">· {dim}</span>}
    </span>
  </li>
);

const PatternAnalysisSection = ({
  findings,
  activeTrend,
  lift,
  hasCalendar,
  calendarInsight,
  bestWindowLabel,
  userId,
}: {
  findings: RhythmFinding[];
  activeTrend: 'clarity' | 'emotion' | 'pressure' | 'regulation';
  lift: PerformanceLift | null;
  hasCalendar: boolean;
  calendarInsight: string | null;
  bestWindowLabel: string | null;
  userId?: string | null;
}) => {
  const [checkInOpen, setCheckInOpen] = useState(true);
  const showDebug = isPatternDebugEnabled(userId);
  // Positive-only card scope + observation guard + hard cap live in
  // buildSection (src/lib/insights/patternSentences.ts).
  const checkInAll = findings.filter((f) => CHECK_IN_DIMS.has(f.dimension));
  const scoped = checkInAll.filter((f) => f.dimension === activeTrend);
  const checkInLines = buildSection(scoped.length > 0 ? scoped : checkInAll, 'check-in', 3);
  const baselineFindingLines = buildSection(findings, 'wearable', 3);

  const liftLines = buildBaselineLiftLines(lift, hasCalendar);
  const extraBaseline = [
    ...(bestWindowLabel ? [`Sharpest window: ${bestWindowLabel}.`] : []),
    ...(calendarInsight ? [calendarInsight] : []),
    ...liftLines,
  ];
  // Hard cap 3 for the whole physiology/demand section (findings + lift lines).
  const baselineFindingsCapped = baselineFindingLines.slice(0, 3);
  const extraBaselineCapped = extraBaseline.slice(0, Math.max(0, 3 - baselineFindingsCapped.length));

  const hasCheckIn = checkInLines.length > 0;
  const hasBaseline = baselineFindingsCapped.length > 0 || extraBaselineCapped.length > 0;
  // Nothing recorded at all vs. data present but nothing clearing the guard.
  const checkInEmptyCopy = checkInAll.length === 0 ? NO_DATA_STATE['check-in'] : EMPTY_STATE['check-in'];
  const baselineEmptyCopy =
    findings.every((f) => CHECK_IN_DIMS.has(f.dimension)) && !lift
      ? NO_DATA_STATE.wearable
      : EMPTY_STATE.wearable;
  const checkInEmerging = hasCheckIn && checkInLines.every((r) => r.tier === 'emerging');


  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setCheckInOpen((v) => !v)}
          className="w-full flex justify-center py-1"
          aria-label="Toggle analysis"
          aria-expanded={checkInOpen}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground/60 flex-shrink-0 transition-transform duration-200',
              checkInOpen && 'rotate-180',
            )}
          />
        </button>
        {checkInOpen && (
          hasCheckIn ? (
            <>
              {checkInEmerging && (
                <p className="pl-2 text-[11px] text-muted-foreground/60 leading-relaxed">{EARLY_PATTERN_NOTE}</p>
              )}
              <ul className="pl-2 space-y-1.5">
                {checkInLines.map((r, i) => (
                  <PatternLine key={`ci-${i}`} text={r.text} dim={r.dimLabel} />
                ))}
              </ul>
            </>
          ) : (
            <p className="pl-2 text-xs text-muted-foreground/70 leading-relaxed">{checkInEmptyCopy}</p>
          )
        )}

      </div>

      <div className="h-px bg-border/40" />

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary/70 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-widest uppercase text-primary/70 font-body">
              Mental Performance Patterns When You Perform Best
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Based on physiology and demand data (wearable + calendar)
            </p>
          </div>
          <InsightInfoModal
            title="Mental Performance Patterns"
            explanation="Patterns derived from your wearable and calendar data — physiology and demand — kept separate from your self-reported check-in patterns."
          />
        </div>
        {hasBaseline ? (
          <ul className="pl-2 space-y-1.5">
            {baselineFindingsCapped.map((r, i) => (
              <PatternLine key={`bl-${i}`} text={r.text} dim={r.dimLabel} />
            ))}
            {extraBaselineCapped.map((line, i) => (
              <PatternLine key={`lift-${i}`} text={line} />
            ))}
          </ul>
        ) : (
          <p className="pl-2 text-xs text-muted-foreground/70 leading-relaxed">{baselineEmptyCopy}</p>
        )}

      </div>

      {showDebug && (
        <div className="space-y-1 rounded-md border border-dashed border-border/60 p-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Reliability audit · {findings.length} raw findings
          </p>
          <ul className="space-y-1.5">
            {[...checkInLines, ...baselineFindingLines].map((r, i) => (
              <PatternDebugRow key={`dbg-${i}`} row={r} />
            ))}
          </ul>
          <p className="text-[10px] font-mono text-muted-foreground/60 break-words">
            dropped: {findings.filter((f) => !f.stats || f.stats.n < 3).length} (no stats / n&lt;3) ·{' '}
            {findings.filter((f) => f.stats && f.stats.n >= 3 && !['peak-day', 'peak-window', 'cell-peak', 'consecutive-pos'].includes(f.kind)).length} (negative scope)
          </p>
        </div>
      )}
    </div>
  );
};

const PerformanceRhythmCard = ({ userId }: PerformanceRhythmCardProps) => {
  const [data, setData] = useState<PerformanceRhythmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [activeTrend, setActiveTrend] = useState<'clarity' | 'emotion' | 'pressure' | 'regulation'>('clarity');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);
    setErrored(false);

    try {
      if (DEV_MODE) {
        const effectiveUserId = DEV_USER.id;
        const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

        const [checkInsRes, calConnRes, calEventsRes, behaviorRes, readinessRes, ritualsRes, dialogueRes, jitRes, wearableRes] = await Promise.all([
          supabase
            .from('daily_checkins')
            .select('outcome, energy_balance, checkin_date, created_at, time_window')
            .eq('user_id', effectiveUserId)
            .gte('checkin_date', thirtyDaysAgo)
            .order('created_at', { ascending: false }),
          supabase
            .from('calendar_connections')
            .select('is_active')
            .eq('user_id', effectiveUserId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('calendar_events')
            .select('id, title, start_time, end_time, provider, attendees_count, is_organizer, is_recurring, event_metadata, external_id')
            .eq('user_id', effectiveUserId)
            .gte('start_time', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('behavior_logs')
            .select('behavior_type, created_at')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('inner_readiness_scores')
            .select('composite_score, energy_tier, score_date, time_of_day')
            .eq('user_id', effectiveUserId)
            .gte('score_date', thirtyDaysAgo),
          supabase
            .from('daily_ritual_completions')
            .select('ritual_date, completion_status, session_period')
            .eq('user_id', effectiveUserId)
            .gte('ritual_date', thirtyDaysAgo),
          supabase
            .from('dialogue_sessions')
            .select('id')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('jit_preferences')
            .select('event_title, action, event_start_time')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('wearable_data')
            .select('summary_date, hrv, resting_heart_rate')
            .eq('user_id', effectiveUserId)
            .gte('summary_date', thirtyDaysAgo)
            .not('hrv', 'is', null),
        ]);

        const checkIns = checkInsRes.data || [];
        const hasCalendar = !!calConnRes.data?.is_active;
        const calendarEvents = calEventsRes.data || [];
        const behaviorLogs = behaviorRes.data || [];
        const readinessScores = readinessRes.data || [];
        const rituals = ritualsRes.data || [];
        const jitPrefs = jitRes.data || [];
        const wearableData = wearableRes.data || [];

        // BUG 5 fix: Scope dialogue_messages by user's session IDs
        const userSessionIds = (dialogueRes.data || []).map((s: any) => s.id);
        let dialogueMessages: any[] = [];
        if (userSessionIds.length > 0) {
          const { data: msgs } = await supabase
            .from('dialogue_messages')
            .select('content, sender_type, session_id')
            .in('session_id', userSessionIds);
          dialogueMessages = msgs || [];
        }

        // Helper
        const isSameDay = (a: string, b: string) => a.split('T')[0] === b.split('T')[0];
        const getTimeWindow = (h: number) => h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : 2;
        const getDayIndex = (d: number) => d === 0 ? 6 : d - 1; // Sun=6, Mon=0

        // ── Build 3x7 grid – uses stored time_window, not UTC-derived hours ──
        const grid: HeatmapCell[][] = Array(3).fill(null).map(() => 
          Array(7).fill(null).map(() => ({ outcome: null, compositeScore: null, divergence: false }))
        );
        const cellLatest: Map<string, number> = new Map();

        for (const ci of checkIns) {
          if (!ci.checkin_date || !ci.outcome) continue;
          const date = new Date(ci.checkin_date);
          const tw = ci.time_window === 'morning' ? 0 : ci.time_window === 'afternoon' ? 1 : 2;
          const di = getDayIndex(date.getDay());
          const cellKey = `${tw}-${di}`;
          const t = ci.created_at ? new Date(ci.created_at).getTime() : 0;
          const prev = cellLatest.get(cellKey) || 0;
          if (t > prev) {
            cellLatest.set(cellKey, t);
            grid[tw][di].outcome = ci.outcome;
          }
        }

        // Overlay composite scores (30-day avg per cell)
        const cellComposites: number[][][] = Array(3).fill(null).map(() => 
          Array(7).fill(null).map(() => [] as number[])
        );
        for (const s of readinessScores) {
          const date = new Date(s.score_date);
          // BUG 6 fix: Use time_of_day column instead of parsing hours from date-only score_date
          const tw = s.time_of_day === 'morning' ? 0 : s.time_of_day === 'afternoon' ? 1 : 2;
          const di = getDayIndex(date.getDay());
          cellComposites[tw][di].push(s.composite_score);
        }
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const scores = cellComposites[t][d];
            if (scores.length > 0) {
              grid[t][d].compositeScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            }
          }
        }

        // Divergence flags
        const outcomeExpected: Record<string, number> = { focused: 75, steady: 60, scattered: 45, drained: 30, overwhelmed: 25 };
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const cell = grid[t][d];
            if (cell.outcome && cell.compositeScore !== null) {
              const expected = outcomeExpected[cell.outcome] || 50;
              if (Math.abs(cell.compositeScore - expected) >= 20) {
                cell.divergence = true;
              }
            }
          }
        }

        // ── Best Readiness Window ──
        let bestReadinessWindow: BestReadinessWindow | null = null;
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const scores = cellComposites[t][d];
            if (scores.length >= 1) {
              const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
              if (!bestReadinessWindow || avg > bestReadinessWindow.avgScore) {
                bestReadinessWindow = {
                  timeWindow: t,
                  day: d,
                  avgScore: avg,
                  label: `${TIME_LABELS[t]} on ${DAYS[d]} (avg readiness: ${avg})`,
                };
              }
            }
          }
        }

        // Logistic event filter – skip transit/admin/booking events
        const LOGISTIC_KEYWORDS = [
          'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
          'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
          'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
          'car service', 'mot', 'oil change', 'dentist', 'optician',
          'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
          'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
        ];
        const LOGISTIC_PATTERN = /\[\d{6,}\]/;
        const isLogisticEvent = (title: string) => {
          const lower = (title || '').toLowerCase();
          if (LOGISTIC_PATTERN.test(title || '')) return true;
          return LOGISTIC_KEYWORDS.some(kw => lower.includes(kw));
        };
        const insightCalendarEvents = calendarEvents.filter(e => e.title && !isLogisticEvent(e.title));

        // ── Calendar Pattern (1B) ──
        let calendarInsight: string | null = null;
        if (hasCalendar && insightCalendarEvents.length > 0 && checkIns.length >= 7) {
          const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
            board: ['board', 'board meeting', 'board of directors'],
            investor: ['investor', 'vc', 'funding', 'pitch'],
            quarterly: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'],
            strategic: ['strategy', 'strategic planning', 'offsite', 'roadmap'],
            client: ['client', 'customer', 'demo', 'proposal'],
            performance_review: ['performance review', 'annual review', 'mid-year'],
            all_hands: ['all hands', 'town hall', 'company meeting'],
            media: ['interview', 'podcast', 'media', 'press'],
            deadline: ['deadline', 'urgent', 'due', 'eod'],
            presentation: ['presentation', 'speaking', 'conference', 'webinar'],
          };
          const eventTypeCorrelations = new Map<string, { scores: number[]; count: number }>();
          for (const event of insightCalendarEvents) {
            if (!event.title) continue;
            const tl = event.title.toLowerCase();
            const eventDate = new Date(event.start_time).toISOString().split('T')[0];
            const eventType = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
              EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
            );
            if (!eventType) continue;
            const dayScore = readinessScores.find(s => isSameDay(s.score_date, eventDate));
            if (!dayScore) continue;
            if (!eventTypeCorrelations.has(eventType)) eventTypeCorrelations.set(eventType, { scores: [], count: 0 });
            const d = eventTypeCorrelations.get(eventType)!;
            d.scores.push(dayScore.composite_score);
            d.count++;
          }
          const correlations: { eventType: string; avgScore: number; count: number }[] = [];
          eventTypeCorrelations.forEach((d, eventType) => {
            if (d.count >= 2) {
              correlations.push({ eventType, avgScore: d.scores.reduce((a, b) => a + b, 0) / d.count, count: d.count });
            }
          });
          correlations.sort((a, b) => a.avgScore - b.avgScore);
          const mostDraining = correlations[0];
          const mostEnergizing = correlations[correlations.length - 1];
          if (mostDraining && mostDraining.avgScore < 50) {
            calendarInsight = `On days with ${mostDraining.eventType.replace('_', ' ')} events, your readiness averages ${Math.round(mostDraining.avgScore)} – observed across ${mostDraining.count} occurrences.`;
          } else if (mostEnergizing && mostEnergizing.avgScore > 65) {
            calendarInsight = `${mostEnergizing.eventType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())} events consistently lift your readiness – avg ${Math.round(mostEnergizing.avgScore)} across ${mostEnergizing.count} occurrences.`;
          }
        }

        // ── Cause-Effect (1C) – All 6 paths mirroring edge function ──
        let causeEffectInsight: string | null = null;

        const EVENT_TYPE_KEYWORDS_CE: Record<string, string[]> = {
          board: ['board', 'board meeting', 'board of directors', 'board deck'],
          investor: ['investor', 'vc', 'funding', 'pitch', 'fundraise'],
          quarterly: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4', 'quarterly review'],
          strategic: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'],
          client: ['client', 'customer', 'demo', 'proposal'],
          performance_review: ['performance review', 'annual review', 'mid-year', '360'],
          all_hands: ['all hands', 'town hall', 'company meeting'],
          media: ['interview', 'podcast', 'media', 'press'],
          deadline: ['deadline', 'urgent', 'due', 'eod', 'cob'],
          presentation: ['presentation', 'speaking', 'conference', 'webinar'],
        };

        // Path A: Calendar Event Type × HRV Correlation
        if (hasCalendar && insightCalendarEvents.length >= 2 && wearableData.length >= 3) {
          const allHRVs = wearableData.map((w: any) => w.hrv as number);
          const hrvBaseline = allHRVs.reduce((a: number, b: number) => a + b, 0) / allHRVs.length;
          const hrvByDate = new Map<string, number>();
          for (const w of wearableData) {
            hrvByDate.set(w.summary_date, w.hrv as number);
          }
          const eventTypeHRV = new Map<string, { hrvs: number[]; titles: string[] }>();
          for (const ev of insightCalendarEvents) {
            if (!ev.title) continue;
            const tl = ev.title.toLowerCase();
            const et = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type =>
              EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl.includes(kw))
            );
            const groupKey = et || (ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title);
            const evDate = new Date(ev.start_time).toISOString().split('T')[0];
            const dayHRV = hrvByDate.get(evDate);
            if (dayHRV === undefined) continue;
            if (!eventTypeHRV.has(groupKey)) eventTypeHRV.set(groupKey, { hrvs: [], titles: [] });
            const entry = eventTypeHRV.get(groupKey)!;
            entry.hrvs.push(dayHRV);
            entry.titles.push(ev.title);
          }
          let bestDeviation: { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string } | null = null;
          eventTypeHRV.forEach((data, et) => {
            if (data.hrvs.length < 1) return;
            const avgHRV = data.hrvs.reduce((a, b) => a + b, 0) / data.hrvs.length;
            const devPct = ((avgHRV - hrvBaseline) / hrvBaseline) * 100;
            if (Math.abs(devPct) >= 10) {
              if (!bestDeviation || Math.abs(devPct) > Math.abs(bestDeviation.devPct)) {
                bestDeviation = { et, avgHRV: Math.round(avgHRV), count: data.hrvs.length, devPct: Math.round(devPct), recentTitle: data.titles[data.titles.length - 1], direction: devPct < 0 ? 'drop' : 'rise' };
              }
            }
          });
          if (bestDeviation) {
            const b = bestDeviation as { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string };
            const label = b.et.replace(/_/g, ' ');
            const absDevPct = Math.abs(b.devPct);
            causeEffectInsight = b.direction === 'drop'
              ? `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV drop (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) – observed across ${b.count} events.`
              : `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV rise (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) – these events don't tax your nervous system.`;
            // Confidence qualifier for single-occurrence correlations
            if (b.count === 1) {
              causeEffectInsight = `Early signal: ${causeEffectInsight} (based on 1 occurrence – will validate over time)`;
            }
            // RHR enrichment
            const rhrByDate = new Map<string, number>();
            for (const w of wearableData) {
              if (w.resting_heart_rate) rhrByDate.set(w.summary_date, w.resting_heart_rate as number);
            }
            const allRHRs = wearableData.filter((w: any) => w.resting_heart_rate).map((w: any) => w.resting_heart_rate as number);
            if (allRHRs.length >= 3) {
              const rhrBaseline = Math.round(allRHRs.reduce((a: number, b: number) => a + b, 0) / allRHRs.length);
              const eventRHRs: number[] = [];
              for (const ev of insightCalendarEvents) {
                if (!ev.title) continue;
                const tl = ev.title.toLowerCase();
                const et = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type =>
                  EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl.includes(kw))
                );
                const groupKey = et || (ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title);
                if (groupKey !== b.et) continue;
                const evDate = new Date(ev.start_time).toISOString().split('T')[0];
                const rhr = rhrByDate.get(evDate);
                if (rhr !== undefined) eventRHRs.push(rhr);
              }
              if (eventRHRs.length >= 1) {
                const avgRHR = Math.round(eventRHRs.reduce((a, b) => a + b, 0) / eventRHRs.length);
                const rhrDiff = avgRHR - rhrBaseline;
                if (Math.abs(rhrDiff) >= 3) {
                  causeEffectInsight += ` RHR averaged ${avgRHR}bpm on those days vs ${rhrBaseline}bpm baseline.`;
                }
              }
            }
          }
        }

        // Path B: behavior_logs → nearest same/next-day check-in
        if (!causeEffectInsight && behaviorLogs.length >= 2 && checkIns.length > 0) {
          const bp = new Map<string, { behavior: string; outcome: string; count: number }>();
          for (const log of behaviorLogs) {
            const bd = new Date(log.created_at).toISOString().split('T')[0];
            const type = log.behavior_type?.toLowerCase();
            if (!type) continue;
            let nearest: typeof checkIns[0] | null = null;
            let nearestDiff = Infinity;
            for (const ci of checkIns) {
              const diff = (new Date(ci.checkin_date).getTime() - new Date(bd).getTime()) / 86400000;
              if (diff >= 0 && diff <= 1 && Math.abs(diff) < nearestDiff && ci.outcome) {
                nearest = ci;
                nearestDiff = Math.abs(diff);
              }
            }
            if (nearest) {
              const key = `${type}→${nearest.outcome}`;
              if (!bp.has(key)) bp.set(key, { behavior: type, outcome: nearest.outcome!, count: 0 });
              bp.get(key)!.count++;
            }
          }
          const totals = new Map<string, number>();
          bp.forEach(p => totals.set(p.behavior, (totals.get(p.behavior) || 0) + p.count));
          const patterns: { behavior: string; outcome: string; conf: number; count: number }[] = [];
          bp.forEach(p => {
            const t = totals.get(p.behavior) || 1;
            const conf = p.count / t;
            if (p.count >= 2 && conf >= 0.4) patterns.push({ behavior: p.behavior, outcome: p.outcome, conf, count: p.count });
          });
          patterns.sort((a, b) => b.conf - a.conf);
          if (patterns[0]) {
            const p = patterns[0];
            const behaviorLabel = p.behavior.replace(/_/g, ' ');
            causeEffectInsight = `On days following ${behaviorLabel.charAt(0).toUpperCase() + behaviorLabel.slice(1)}, you tend to check in '${p.outcome}' ${Math.round(p.conf * 100)}% of the time.`;
            // HRV enrichment for Path B
            if (wearableData.length >= 3) {
              const hrvByDateB = new Map<string, number>();
              for (const w of wearableData) hrvByDateB.set(w.summary_date, w.hrv as number);
              const allHRVsB = wearableData.map((w: any) => w.hrv as number);
              const hrvBaselineB = Math.round(allHRVsB.reduce((a: number, b: number) => a + b, 0) / allHRVsB.length);
              const behaviorDayHRVs: number[] = [];
              for (const log of behaviorLogs) {
                if (log.behavior_type?.toLowerCase() !== p.behavior) continue;
                const bd = new Date(log.created_at).toISOString().split('T')[0];
                const hrv = hrvByDateB.get(bd);
                if (hrv !== undefined) behaviorDayHRVs.push(hrv);
              }
              if (behaviorDayHRVs.length >= 2) {
                const avgHRV = Math.round(behaviorDayHRVs.reduce((a, b) => a + b, 0) / behaviorDayHRVs.length);
                causeEffectInsight += ` Your HRV averaged ${avgHRV}ms on those days vs ${hrvBaselineB}ms baseline.`;
              }
            }
          }
        }

        // Path C: Calendar event → next-day check-in outcome
        if (!causeEffectInsight && hasCalendar && insightCalendarEvents.length >= 3 && checkIns.length >= 5) {
          const etOutcomes = new Map<string, string[]>();
          for (const ev of insightCalendarEvents) {
            if (!ev.title) continue;
            const tl = ev.title.toLowerCase();
            let et = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type =>
              EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl.includes(kw))
            );
            if (!et) et = ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title;
            const evDate = new Date(ev.start_time).toISOString().split('T')[0];
            const nextDate = new Date(new Date(ev.start_time).getTime() + 86400000).toISOString().split('T')[0];
            const sameDayCI = checkIns.find(c => c.checkin_date === evDate);
            const nextDayCI = checkIns.find(c => c.checkin_date === nextDate);
            const matchCI = nextDayCI || sameDayCI;
            if (matchCI?.outcome) {
              if (!etOutcomes.has(et)) etOutcomes.set(et, []);
              etOutcomes.get(et)!.push(matchCI.outcome);
            }
          }
          let bestCalCE: { et: string; outcome: string; pct: number; count: number } | null = null;
          etOutcomes.forEach((outcomes, et) => {
            if (outcomes.length < 2) return;
            const freq = new Map<string, number>();
            outcomes.forEach(o => freq.set(o, (freq.get(o) || 0) + 1));
            freq.forEach((cnt, outcome) => {
              const pct = cnt / outcomes.length;
              if (pct >= 0.4 && (!bestCalCE || pct > bestCalCE.pct)) {
                bestCalCE = { et, outcome, pct, count: outcomes.length };
              }
            });
          });
          if (bestCalCE) {
            const b = bestCalCE as { et: string; outcome: string; pct: number; count: number };
            const isKeyword = Object.keys(EVENT_TYPE_KEYWORDS_CE).includes(b.et);
            const label = isKeyword ? `${b.et.replace(/_/g, ' ')} events` : `'${b.et}' events`;
            causeEffectInsight = `After ${label}, you tend to check in '${b.outcome}' – ${Math.round(b.pct * 100)}% of the time across ${b.count} occurrences.`;
            // HRV enrichment for Path C
            if (wearableData.length >= 3) {
              const hrvByDateC = new Map<string, number>();
              for (const w of wearableData) hrvByDateC.set(w.summary_date, w.hrv as number);
              const matchedDayHRVs: number[] = [];
              for (const ev of insightCalendarEvents) {
                if (!ev.title) continue;
                const tl2 = ev.title.toLowerCase();
                const et2 = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type => EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl2.includes(kw)));
                const groupKey = et2 || (ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title);
                if (groupKey !== b.et) continue;
                const evDate = new Date(ev.start_time).toISOString().split('T')[0];
                const hrv = hrvByDateC.get(evDate);
                if (hrv !== undefined) matchedDayHRVs.push(hrv);
              }
              if (matchedDayHRVs.length >= 2) {
                const avgHRV = Math.round(matchedDayHRVs.reduce((a, b) => a + b, 0) / matchedDayHRVs.length);
                causeEffectInsight += ` Your HRV on those days averaged ${avgHRV}ms.`;
              }
            }
          }
        }

        // Path D: Event day vs non-event day
        if (!causeEffectInsight && hasCalendar && insightCalendarEvents.length >= 2 && checkIns.length >= 5) {
          const eventDayOutcomes: string[] = [];
          const nonEventDayOutcomes: string[] = [];
          const eventDates = new Set(insightCalendarEvents.map(e => new Date(e.start_time).toISOString().split('T')[0]));
          for (const ci of checkIns) {
            if (!ci.outcome) continue;
            if (eventDates.has(ci.checkin_date)) eventDayOutcomes.push(ci.outcome);
            else nonEventDayOutcomes.push(ci.outcome);
          }
          if (eventDayOutcomes.length >= 3 && nonEventDayOutcomes.length >= 2) {
            const posOutcomes = new Set(['focused', 'steady']);
            const eventPosPct = eventDayOutcomes.filter(o => posOutcomes.has(o)).length / eventDayOutcomes.length;
            const nonEventPosPct = nonEventDayOutcomes.filter(o => posOutcomes.has(o)).length / nonEventDayOutcomes.length;
            const diff = eventPosPct - nonEventPosPct;
            if (Math.abs(diff) >= 0.15) {
              causeEffectInsight = diff > 0
                ? `On days with calendar events, you check in positively ${Math.round(eventPosPct * 100)}% of the time vs ${Math.round(nonEventPosPct * 100)}% on quieter days – external structure may help you focus.`
                : `On quieter days without events, you check in positively ${Math.round(nonEventPosPct * 100)}% of the time vs ${Math.round(eventPosPct * 100)}% on event-heavy days – your inner state may benefit from space.`;
              // HRV enrichment for Path D
              if (wearableData.length >= 3) {
                const hrvByDateD = new Map<string, number>();
                for (const w of wearableData) hrvByDateD.set(w.summary_date, w.hrv as number);
                const eventDayHRVs: number[] = [];
                const nonEventDayHRVs: number[] = [];
                for (const ci of checkIns) {
                  const hrv = hrvByDateD.get(ci.checkin_date);
                  if (hrv === undefined) continue;
                  if (eventDates.has(ci.checkin_date)) eventDayHRVs.push(hrv);
                  else nonEventDayHRVs.push(hrv);
                }
                if (eventDayHRVs.length >= 2 && nonEventDayHRVs.length >= 2) {
                  const evAvg = Math.round(eventDayHRVs.reduce((a, b) => a + b, 0) / eventDayHRVs.length);
                  const neAvg = Math.round(nonEventDayHRVs.reduce((a, b) => a + b, 0) / nonEventDayHRVs.length);
                  causeEffectInsight += ` HRV: ${evAvg}ms on event days vs ${neAvg}ms on quiet days.`;
                }
              }
            }
          }
        }

        // Path E: JIT completion → outcome + HRV enrichment
        if (!causeEffectInsight && jitPrefs.length >= 2 && checkIns.length >= 5) {
          const jitCompleted = jitPrefs.filter((j: any) => j.action === 'completed' || j.action === 'accepted');
          if (jitCompleted.length >= 2) {
            if (wearableData.length >= 3) {
              const hrvByDate = new Map<string, number>();
              for (const w of wearableData) {
                hrvByDate.set(w.summary_date, w.hrv as number);
              }
              const jitDayHRVs: number[] = [];
              const allEventDates = new Set<string>();
              for (const j of jitCompleted) {
                if (!j.event_start_time) continue;
                const evDate = new Date(j.event_start_time).toISOString().split('T')[0];
                allEventDates.add(evDate);
                const hrv = hrvByDate.get(evDate);
                if (hrv !== undefined) jitDayHRVs.push(hrv);
              }
              const nonPreppedHRVs: number[] = [];
              for (const ev of insightCalendarEvents) {
                const evDate = new Date(ev.start_time).toISOString().split('T')[0];
                if (allEventDates.has(evDate)) continue;
                const hrv = hrvByDate.get(evDate);
                if (hrv !== undefined) nonPreppedHRVs.push(hrv);
              }
              if (jitDayHRVs.length >= 2 && nonPreppedHRVs.length >= 2) {
                const jitAvg = Math.round(jitDayHRVs.reduce((a, b) => a + b, 0) / jitDayHRVs.length);
                const nonAvg = Math.round(nonPreppedHRVs.reduce((a, b) => a + b, 0) / nonPreppedHRVs.length);
                causeEffectInsight = jitAvg > nonAvg
                  ? `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped event days – preparation may reduce physiological stress.`
                  : `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped days – prep helps your state even when HRV stays similar.`;
              }
            }
            if (!causeEffectInsight) {
              const completedOutcomes: string[] = [];
              for (const j of jitCompleted) {
                if (!j.event_start_time) continue;
                const evDate = new Date(j.event_start_time).toISOString().split('T')[0];
                const ci = checkIns.find(c => c.checkin_date === evDate);
                if (ci?.outcome) completedOutcomes.push(ci.outcome);
              }
              const positiveCount = completedOutcomes.filter(o => o === 'focused' || o === 'steady').length;
              if (completedOutcomes.length >= 2 && positiveCount / completedOutcomes.length >= 0.5) {
                causeEffectInsight = `When you completed JIT prep before events, you checked in positively ${Math.round(positiveCount / completedOutcomes.length * 100)}% of the time – observed across ${completedOutcomes.length} events.`;
              }
            }
          }
        }

        // Path F: Temporal fallback (weekday/weekend, morning/evening)
        if (!causeEffectInsight && checkIns.length >= 7) {
          const positiveOutcomes = new Set(['focused', 'steady']);
          const weekdayCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return d >= 1 && d <= 5 && c.outcome; });
          const weekendCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return (d === 0 || d === 6) && c.outcome; });
          if (weekdayCI.length >= 3 && weekendCI.length >= 2) {
            const wdPos = weekdayCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekdayCI.length;
            const wePos = weekendCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekendCI.length;
            if (Math.abs(wdPos - wePos) >= 0.15) {
              const better = wdPos > wePos ? 'weekdays' : 'weekends';
              const worse = wdPos > wePos ? 'weekends' : 'weekdays';
              const betterPct = Math.round(Math.max(wdPos, wePos) * 100);
              const worsePct = Math.round(Math.min(wdPos, wePos) * 100);
              causeEffectInsight = `Your positive check-in rate on ${better} is ${betterPct}% vs ${worsePct}% on ${worse} – your environment on ${better} may better support your inner state.`;
            }
          }
          if (!causeEffectInsight) {
            const morningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 5 && h < 12 && c.outcome; });
            const eveningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 17 && c.outcome; });
            if (morningCI.length >= 3 && eveningCI.length >= 3) {
              const mPos = morningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / morningCI.length;
              const ePos = eveningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / eveningCI.length;
              if (Math.abs(mPos - ePos) >= 0.15) {
                const better = mPos > ePos ? 'mornings' : 'evenings';
                const betterPct = Math.round(Math.max(mPos, ePos) * 100);
                causeEffectInsight = `You tend to check in more positively during ${better} (${betterPct}% positive) – your natural rhythm may favour this window for high-stakes work.`;
              }
            }
          }
        }

        // ── How You Show Up (DEV mode) ──
        // Presence/coach/JIT scoring is fully retired. The new Mind Rhythm
        // Patterns block is computed only by the edge function in production;
        // DEV mode renders without rhythm findings to keep this code path tiny.
        const presenceScore: number | null = null;
        const presenceLabel: string | null = null;
        const presenceInsight: string | null = null;

        // ── Build Full Month Calendar ──
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-indexed
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        // Map time_window values to slot keys
        const twToSlot = (tw: string) => {
          if (tw === 'morning') return 'morning';
          if (tw === 'afternoon') return 'midday';
          return 'evening';
        };

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthDays: WeekDay[] = [];

        for (let d = 1; d <= daysInMonth; d++) {
          const dayDate = new Date(currentYear, currentMonth, d);
          const dateStr = format(dayDate, 'yyyy-MM-dd');
          const isFuture = dateStr > todayStr;
          const isToday = dateStr === todayStr;

          const dayCheckIns = checkIns.filter(c => c.checkin_date === dateStr);
          const slots = { morning: { outcome: null as string | null }, midday: { outcome: null as string | null }, evening: { outcome: null as string | null } };
          const slotTimestamps: Record<string, number> = { morning: 0, midday: 0, evening: 0 };

          if (!isFuture) {
            for (const ci of dayCheckIns) {
              if (!ci.outcome) continue;
              const slot = twToSlot(ci.time_window || 'morning');
              const ciTime = ci.created_at ? new Date(ci.created_at).getTime() : 0;
              if (ciTime > slotTimestamps[slot]) {
                slotTimestamps[slot] = ciTime;
                slots[slot].outcome = ci.outcome;
              }
            }
          }

          monthDays.push({
            date: dateStr,
            dayLabel: dayNames[dayDate.getDay()],
            dateNum: String(d),
            isToday,
            isFuture,
            slots,
          });
        }

        // Wrap in a single weekRow for compatibility
        const weekRows: WeekRow[] = [{
          weekLabel: '',
          startDate: format(new Date(currentYear, currentMonth, 1), 'yyyy-MM-dd'),
          days: monthDays,
        }];

        // ── Data Source Note ──
        const daySpan = checkIns.length > 0
          ? Math.ceil((new Date().getTime() - new Date(checkIns[checkIns.length - 1].checkin_date).getTime()) / 86400000)
          : 0;
        let dataSourceNote = `Based on ${checkIns.length} check-in${checkIns.length !== 1 ? 's' : ''}`;
        if (behaviorLogs.length > 0) dataSourceNote += `, ${behaviorLogs.length} behavior log${behaviorLogs.length !== 1 ? 's' : ''}`;
        if (hasCalendar) dataSourceNote += ', calendar data';
        if (wearableData.length > 0) dataSourceNote += `, ${wearableData.length} HRV reading${wearableData.length !== 1 ? 's' : ''}`;
        dataSourceNote += ` over ${daySpan} days`;

        setData({
          presenceScore,
          presenceLabel,
          presenceInsight,
          mindRhythmPatterns: null,
          positiveRate: null,
          calendarInsight,
          causeEffectInsight,
          grid,
          weekRows,
          bestReadinessWindow: bestReadinessWindow,
          checkInCount: checkIns.length,
          behaviorLogCount: behaviorLogs.length,
          hasCalendar,
          dataSourceNote,
        });
        setLoading(false);
        return;
      }

      // Production: call edge function
      const accessToken = await getAuthToken();
      if (!accessToken) {
        console.warn('[PerformanceRhythmCard] No auth token available');
        setErrored(true);
        setLoading(false);
        return;
      }
      const { data: result, error } = await supabase.functions.invoke('performance-rhythm-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!error && result) {
        setData(result as PerformanceRhythmData);
      } else {
        setErrored(true);
      }
    } catch (err) {
      console.error('[PerformanceRhythmCard] Error:', err);
      setErrored(true);
    } finally {
      setLoading(false);
    }
  };

  const getProgressiveMessage = () => {
    if (!data) return null;
    if (data.checkInCount === 0) return 'Complete your first check-in to start mapping your rhythm.';
    if (data.checkInCount < 5) return `${data.checkInCount} check-in${data.checkInCount > 1 ? 's' : ''} logged – ${5 - data.checkInCount} more to see your readiness rhythm.`;
    return null;
  };

  const getInsightUnlockMessages = () => {
    if (!data || data.checkInCount < 5) return [];
    const messages: { icon: 'sparkles' | 'calendar' | 'target'; text: string }[] = [];

    if (data.checkInCount < 7) {
      messages.push({
        icon: 'target',
        text: `${7 - data.checkInCount} more check-in${7 - data.checkInCount > 1 ? 's' : ''} to unlock calendar, cause-effect & presence insights`,
      });
    } else {
      if (!data.calendarInsight && !data.causeEffectInsight) {
        if (!data.hasCalendar) {
          messages.push({ icon: 'calendar', text: 'Connect your calendar to reveal how events affect your readiness' });
        }
        if (data.behaviorLogCount < 3) {
          messages.push({ icon: 'target', text: `Log ${3 - data.behaviorLogCount} more behavior${3 - data.behaviorLogCount > 1 ? 's' : ''} to see cause-effect patterns` });
        }
      }
      if (!data.presenceLabel) {
        messages.push({ icon: 'sparkles', text: 'Keep checking in – presence insights appear after more high-stakes moments' });
      }
    }

    return messages;
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            When You Perform Best
          </span>
          <div className="flex items-center gap-1">
            <InsightShareSlot />
            <InsightInfoModal
              title="When You Perform Best"
              explanation="When you’re at your sharpest, and what your outer world is doing to your inner state — patterns you can’t see without zooming out."
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : errored ? (
          <div className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Couldn&rsquo;t load this card. Try refreshing.</span>
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-6">Unable to load rhythm data.</p>
        ) : (
          <div className="space-y-5">
            {/* Progressive message */}
            {getProgressiveMessage() && (
              <p className="text-xs text-muted-foreground/70 text-center">
                {getProgressiveMessage()}
              </p>
            )}

            {/* Section header for check-in patterns */}
            {data.checkInCount >= 5 && (
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary/70 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold tracking-widest uppercase text-primary/70 font-body">
                    Mental Performance Patterns
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Based on check-in data
                  </p>
                </div>
              </div>
            )}

            {/* Tab switcher: one chart at a time */}
            {data.checkInCount >= 5 && (
              <SegmentedToggle
                ariaLabel="Mental performance dimension"
                value={activeTrend}
                onChange={(v) => setActiveTrend(v)}
                options={[
                  { value: 'clarity', label: 'Clarity' },
                  { value: 'emotion', label: 'Emotion' },
                  { value: 'pressure', label: 'Pressure' },
                  { value: 'regulation', label: 'Regulation' },
                ]}
              />
            )}

            {/* Energy Trend removed — mind dimensions only */}
            {false && data.checkInCount >= 5 && data.weekRows && (() => {
              const allDays = data.weekRows.flatMap(w => w.days);
              const todayIdx = allDays.findIndex(d => d.isToday);

              // Energy streak: consecutive in-month days (ending today, or
              // yesterday if today not yet logged) where ANY slot outcome
              // was 'focused' or 'steady'. Resets on the 1st of the month.
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayStr = today.toLocaleDateString('en-CA');
              const month = today.getMonth();
              const year = today.getFullYear();
              const inMonth = allDays.filter(d => {
                const dt = new Date(d.date);
                return !d.isFuture && dt.getMonth() === month && dt.getFullYear() === year;
              });
              const isPositive = (d: typeof allDays[number]) =>
                [d.slots.morning.outcome, d.slots.midday.outcome, d.slots.evening.outcome]
                  .some(o => o === 'focused' || o === 'steady');
              const hasAny = (d: typeof allDays[number]) =>
                [d.slots.morning.outcome, d.slots.midday.outcome, d.slots.evening.outcome].some(o => !!o);
              let i = inMonth.length - 1;
              if (i >= 0 && inMonth[i].date === todayStr && !hasAny(inMonth[i])) i -= 1;
              let energyStreak = 0;
              while (i >= 0 && isPositive(inMonth[i])) { energyStreak += 1; i -= 1; }

              return (
                <>
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground font-body">
                          Energy Trend
                        </span>
                        <InsightInfoModal
                          title="Energy Trend"
                          explanation="Each dot is a check-in at that time of day. The colour shows how you reported feeling. Empty dots mean no check-in was logged."
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 self-center flex-1 text-center">← scroll for past weeks</span>
                      <div className="flex-shrink-0">
                        <StreakWreath
                          count={energyStreak}
                          label={energyStreak > 0 ? 'Peak Energy' : 'start your streak'}
                        />
                      </div>
                    </div>

                    <div className="flex">
                      {/* Fixed row labels */}
                      <div className="flex flex-col gap-1.5 mr-2.5 pt-[38px]">
                        {['Morning', 'Midday', 'Evening'].map(label => (
                          <div key={label} className="h-[22px] flex items-center justify-end">
                            <span className="text-xs text-muted-foreground whitespace-nowrap w-[44px] text-right">{label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Scrollable day columns */}
                      <div
                        className="overflow-x-auto flex-1 pb-1"
                        ref={(el) => {
                          if (!el) return;
                          if (isMobile) {
                            const colW = Math.floor(el.clientWidth / 7);
                            const cols = el.querySelectorAll('[data-day-col]');
                            cols.forEach((c: Element) => {
                              (c as HTMLElement).style.width = `${colW}px`;
                              (c as HTMLElement).style.minWidth = `${colW}px`;
                            });
                          }
                          if (todayIdx >= 0) {
                            const todayDate = new Date(allDays[todayIdx].date);
                            const dow = todayDate.getDay();
                            const mondayOffset = dow === 0 ? 6 : dow - 1;
                            const mondayIdx = Math.max(0, todayIdx - mondayOffset);
                            const colWidth = isMobile
                              ? Math.floor(el.clientWidth / 7)
                              : 27;
                            const scrollTo = mondayIdx * colWidth;
                            setTimeout(() => { el.scrollLeft = scrollTo; }, 80);
                          }
                        }}
                        style={{ WebkitOverflowScrolling: 'touch' }}
                      >
                        <div
                          className="inline-flex"
                          style={{
                            minWidth: 'max-content',
                            gap: isMobile ? 0 : '4px',
                          }}
                        >
                          {allDays.map((day) => (
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
                              {/* Day header */}
                              <div className="flex flex-col items-center h-[34px] justify-end pb-1">
                                <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                                <span className={cn('text-xs', day.isToday ? 'text-primary font-medium' : 'text-foreground/70')}>
                                  {day.dateNum}
                                </span>
                              </div>
                              {/* 3 dots: morning, midday, evening */}
                              {(['morning', 'midday', 'evening'] as const).map((tw) => {
                                const slot = day.slots[tw];
                                const hasOutcome = slot.outcome && !day.isFuture;
                                const colors = hasOutcome ? stateColors[slot.outcome || ''] : null;

                                return (
                                  <div
                                    key={tw}
                                    className={cn(
                                      'w-[22px] h-[22px] rounded-md flex-shrink-0 relative overflow-hidden transition-all duration-200',
                                      day.isFuture
                                        ? 'border border-dashed border-border/40 bg-transparent'
                                        : hasOutcome
                                          ? 'shadow-sm'
                                          : 'bg-white/90 dark:bg-white/15',
                                      day.isToday && !day.isFuture && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
                                    )}
                                    style={hasOutcome && colors ? {
                                      background: `linear-gradient(135deg, ${colors.color}, ${colors.dark})`,
                                      boxShadow: `0 2px 6px ${colors.glow}`,
                                    } : undefined}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-3">
                    {Object.entries(stateColors).map(([state, style]) => (
                      <div key={state} className="flex items-center gap-1.5">
                        <div
                          className="w-3 h-2.5 rounded-sm shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${style.color}, ${style.dark})` }}
                        />
                        <span>{style.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Clarity / Sharpness / Confidence trends — single chart per tab */}
            {data.checkInCount >= 5 && activeTrend === 'clarity' && (
              <LevelTrendCalendar
                userId={userId}
                field="clarity_level"
                title="Clarity Trend"
                explanation="Each dot is your reported clarity (1–5) at that time of day. Cooler tones mean higher clarity; empty dots mean no check-in for that slot."
                vocabulary={{ 5: 'Crystal', 4: 'Lucid', 3: 'Neutral', 2: 'Obscured', 1: 'Clouded' }}
                palette="clarity"
                streakLabel="Peak Clarity"
                hideStreak
                lookbackDays={90}
              />
            )}
            {data.checkInCount >= 5 && activeTrend === 'emotion' && (
              <LevelTrendCalendar
                userId={userId}
                field="emotion_level"
                title="Emotion Trend"
                explanation="Each dot is your reported emotional state (1–5) at that time of day. Deeper tones mean more open and composed; empty dots mean no check-in for that slot."
                vocabulary={{ 5: 'Open', 4: 'Composed', 3: 'Balanced', 2: 'Unsettled', 1: 'Reactive' }}
                palette="emotion"
                streakLabel="Open Days"
                hideStreak
                lookbackDays={90}
              />
            )}
            {data.checkInCount >= 5 && activeTrend === 'pressure' && (
              <LevelTrendCalendar
                userId={userId}
                field="pressure_level"
                title="Pressure Trend"
                explanation="Each dot is your felt pressure (1–5) at that time of day. Deeper tones mean more spacious; lighter tones mean overloaded. Empty dots mean no check-in for that slot."
                vocabulary={{ 5: 'Spacious', 4: 'Light', 3: 'Manageable', 2: 'Elevated', 1: 'Overloaded' }}
                palette="pressure"
                streakLabel="Spacious Days"
                hideStreak
                lookbackDays={90}
              />
            )}
            {data.checkInCount >= 5 && activeTrend === 'regulation' && (
              <LevelTrendCalendar
                userId={userId}
                field="regulation_level"
                title="Regulation Trend"
                explanation="Each dot is your nervous-system regulation (1–5) at that time of day. Deeper tones mean stronger control; empty dots mean no check-in for that slot."
                vocabulary={{ 5: 'In Control', 4: 'Strong', 3: 'Holding', 2: 'Low', 1: 'Reactive' }}
                palette="regulation"
                streakLabel="In-Control Days"
                hideStreak
                lookbackDays={90}
              />
            )}

            {/* Pattern Analysis — check-in patterns vs baseline patterns */}
            {data.checkInCount >= 7 && (
              <PatternAnalysisSection
                findings={data.mindRhythmPatterns?.all ?? []}
                activeTrend={activeTrend}
                lift={data.performanceLift ?? null}
                hasCalendar={data.hasCalendar}
                calendarInsight={data.calendarInsight ?? null}
                bestWindowLabel={data.bestReadinessWindow?.label ?? null}
                userId={userId}
              />

            )}

            {/* Empty-state when ≥7 check-ins but no findings yet */}
            {data.checkInCount >= 7 && data.mindRhythmPatterns !== null && data.mindRhythmPatterns?.topThree.length === 0 && (
              <div className="p-3 rounded-xl bg-muted/15">
                <p className="text-xs text-muted-foreground/80 leading-relaxed text-center">
                  Patterns will sharpen as your check-ins accumulate across more days and times.
                </p>
              </div>
            )}


            {/* Insight unlock incentives */}
            {getInsightUnlockMessages().length > 0 && !data.presenceLabel && !data.calendarInsight && !data.causeEffectInsight && (
              <div className="space-y-2">
                {getInsightUnlockMessages().map((msg, i) => (
                  <div key={i} className="p-3 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 flex items-center gap-3">
                    {msg.icon === 'sparkles' && <Sparkles className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    {msg.icon === 'calendar' && <Calendar className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    {msg.icon === 'target' && <Sparkles className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    <p className="text-xs text-muted-foreground leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>
            )}
            {data.checkInCount >= 7 && !data.hasCalendar && !data.calendarInsight && (
              <div className="p-4 rounded-xl bg-muted/20 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Connect your calendar to see how your outer world affects your inner state.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceRhythmCard;
