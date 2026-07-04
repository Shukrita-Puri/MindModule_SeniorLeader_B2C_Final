/**
 * Performance Causality Card (v4 — unified drain grids)
 *
 * Renders the three drain lenses with one shared grid grammar:
 *   - Stress Load   : per-event-window peak HR delta vs resting baseline
 *   - Burnout Risk  : single HRV trend row across available weeks
 *   - Recovery Time : event categories placed into recovery-duration buckets
 *
 * IMPORTANT — Proprietary logic protection:
 *   This component renders ONLY values, colors, sample sizes, and confidence
 *   tiers received from the engine. It contains NO formulas, weights, or
 *   explainer copy describing how the numbers are produced. All such logic
 *   lives exclusively in supabase/functions/cause-effect-engine/index.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Calendar as CalendarIcon, Watch } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { shouldUsePreviewMock, isPreviewContext } from '@/utils/previewAuth';
import { MOCK_CAUSALITY_PAYLOAD } from '@/components/insights/causalityMockData';
import { cn } from '@/lib/utils';

// ── Types (mirror engine output, payload-only fields) ────────────────
type Confidence = 'strong' | 'emerging';
interface StressMatrix {
  events: string[];
  days: string[];
  cells: (number | null)[][];
  n: number[][];
  confidence: (Confidence | null)[][];
  maxObserved: number;
  topCell: { event: string; day: string; value: number } | null;
  lowCell: { event: string; day: string; value: number } | null;
  topDay: { day: string; total: number } | null;
}
interface BurnoutMatrix {
  weeks: string[];
  dims: Array<{
    key: 'load' | 'rhr' | 'hrv' | 'sleep';
    label: string;
    color: string;
    weekly: Array<number | null>;
    trajectory: 'escalating' | 'stable' | 'improving';
  }>;
  cardTrajectory: 'escalating' | 'stable' | 'improving';
  bannerCopy: string;
}
interface RecoveryByEventEntry {
  eventType: string;
  recoveryDays: number;
  rhrDeltaBpm: number;
  n: number;
  confidence: Confidence;
  lastSeen: string;
}
interface RecoveryByEvent {
  entries: RecoveryByEventEntry[];
  maxRecoveryDays: number;
  topEntry: RecoveryByEventEntry | null;
}
interface Coverage {
  hasCalendar: boolean;
  hasWearable: boolean;
  checkinCount?: number;
  wearableDayCount?: number;
  eventCount?: number;
}
interface CausalityPayload {
  coverage: Coverage;
  stressMatrix?: StressMatrix;
  burnoutMatrix?: BurnoutMatrix;
  recoveryByEvent?: RecoveryByEvent | null;
  version?: number;
  cached?: boolean;
}

type DrainCell = {
  categoryId: string;
  bucketLabel: string;
  value: number | null;
  n: number;
  topEventLabel?: string;
  topEventValue?: number;
};

interface DrainHeatmapGridProps {
  rows: string[];
  columns: string[];
  cells: DrainCell[];
  maxValue: number;
  unit: 'bpm' | 'days' | 'risk score';
  rampLabel: { low: string; high: string };
  emptyLabel?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'Board reviews': 'Governance',
  'Board / governance': 'Governance',
  'Board governance': 'Governance',
  'Investor calls': 'Visibility',
  'Town halls': 'Visibility',
  'Client meetings': 'Visibility',
  'Small-group session': 'Visibility',
  'Small-group sessions': 'Visibility',
  '1:1s': 'Relationship / 1:1',
  'Catch-up': 'Relationship / 1:1',
  'Catch-ups': 'Relationship / 1:1',
  Networking: 'Networking',
  'Deep work': 'Deep Work',
  'Solo work block': 'Deep Work',
  Interviews: 'Hiring',
};

const RECOVERY_BUCKETS = [
  { label: '<6hrs', min: 0, max: 0.25 },
  { label: '6-24hrs', min: 0.25, max: 1 },
  { label: '1-2d', min: 1, max: 2 },
  { label: '2-4d', min: 2, max: 4 },
  { label: '4+d', min: 4, max: Infinity },
];

const normalizeCategory = (label: string) => CATEGORY_LABELS[label] ?? label;

// ── Coral ramp for Stress Load (from spec; opacity-free hex stops) ───
const CORAL_RAMP = ['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D', '#712B13', '#4A1B0C'];
function coralFor(value: number | null, max: number): { bg: string; fg: string } {
  if (value === null || max <= 0) return { bg: CORAL_RAMP[0], fg: '#7a4632' };
  const t = Math.max(0, Math.min(1, value / max));
  const idx = Math.min(CORAL_RAMP.length - 1, Math.floor(t * CORAL_RAMP.length));
  return { bg: CORAL_RAMP[idx], fg: idx >= 4 ? '#FFF5EE' : '#5b2716' };
}

function DrainHeatmapGrid({
  rows,
  columns,
  cells,
  maxValue,
  unit,
  rampLabel,
  emptyLabel = 'No data yet',
}: DrainHeatmapGridProps) {
  const cellMap = useMemo(() => {
    const map = new Map<string, DrainCell>();
    cells.forEach((cell) => map.set(`${cell.categoryId}::${cell.bucketLabel}`, cell));
    return map;
  }, [cells]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[11px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground/70 font-normal pr-2 align-bottom"> </th>
              {columns.map((column) => (
                <th
                  key={column}
                  title={column}
                  className="text-muted-foreground/70 font-medium tracking-wide px-1 pb-1 align-bottom min-w-[3.4rem]"
                >
                  <span className="block truncate max-w-[5rem]">{column}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="text-muted-foreground/80 font-medium pr-2 max-w-[7rem]">
                  <span className="block truncate" title={row}>{row}</span>
                </td>
                {columns.map((column) => {
                  const cell = cellMap.get(`${row}::${column}`);
                  const value = cell?.value ?? null;
                  const { bg, fg } = coralFor(value, maxValue);
                  const displayValue =
                    value === null
                      ? '·'
                      : unit === 'bpm'
                        ? `+${Math.round(value)}`
                        : unit === 'days'
                          ? `${value}`
                          : `${Math.round(value)}`;
                  const topLine =
                    value === null || !cell
                      ? `${row} · ${column} — ${emptyLabel}`
                      : `${row} · ${column} · n=${cell.n}`;
                  const eventLine =
                    cell?.topEventLabel && cell.topEventValue != null
                      ? `\n${cell.topEventLabel} · ${unit === 'bpm' ? '+' : ''}${cell.topEventValue}${unit}`
                      : '';

                  return (
                    <td key={`${row}-${column}`} className="p-0">
                      <div
                        title={`${topLine}${eventLine}`}
                        className={cn(
                          'h-9 rounded-md flex items-center justify-center tabular-nums font-medium transition-colors',
                          value === null && 'bg-white/80 dark:bg-white/10 text-muted-foreground/40',
                        )}
                        style={value !== null ? { background: bg, color: fg } : undefined}
                      >
                        {displayValue}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>{rampLabel.low}</span>
        <div className="flex gap-1">
          {CORAL_RAMP.map((c) => (
            <span key={c} className="w-4 h-2.5 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>{rampLabel.high}</span>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-2 min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">{label}</div>
      <div className="text-sm font-medium tabular-nums truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground/70 truncate">{sub}</div>
    </div>
  );
}

function LockedTile({
  title,
  message,
  progress,
}: {
  title: string;
  message: string;
  progress?: { current: number; target: number };
}) {
  const pct = progress
    ? Math.max(0, Math.min(100, Math.round((progress.current / Math.max(progress.target, 1)) * 100)))
    : null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-4 space-y-2">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{message}</div>
      {progress && pct !== null && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
            <div className="h-full rounded-full bg-foreground/80 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground">{pct}%</div>
        </div>
      )}
    </div>
  );
}

// ── Tab pill button ──────────────────────────────────────────────────
function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors',
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  );
}

// ── Stress Load tab ──────────────────────────────────────────────────
function StressLoadTab({ matrix }: { matrix: StressMatrix }) {
  const { events, days, cells, n, maxObserved, topDay } = matrix;
  const hasAny = cells.some((row) => row.some((v) => v !== null));
  if (!hasAny) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Need a few more wearable days during meetings to populate.
      </p>
    );
  }

  const rows = Array.from(new Set(events.map(normalizeCategory)));
  const aggregatedCells = new Map<string, DrainCell>();
  days.forEach((day, dayIndex) => {
    events.forEach((event, eventIndex) => {
      const value = cells[dayIndex]?.[eventIndex] ?? null;
      const categoryId = normalizeCategory(event);
      const count = n[dayIndex]?.[eventIndex] ?? 0;
      const key = `${categoryId}::${day}`;
      const existing = aggregatedCells.get(key);
      if (!existing) {
        aggregatedCells.set(key, {
          categoryId,
          bucketLabel: day,
          value,
          n: count,
          topEventLabel: event,
          topEventValue: value ?? undefined,
        });
        return;
      }
      existing.n += count;
      if (value !== null && (existing.value === null || value > existing.value)) {
        existing.value = value;
        existing.topEventLabel = event;
        existing.topEventValue = value;
      }
    });
  });
  const gridCells = Array.from(aggregatedCells.values());

  const categoryCounts = new Map<string, number>();
  gridCells.forEach((cell) => {
    if (cell.value !== null) {
      categoryCounts.set(cell.categoryId, (categoryCounts.get(cell.categoryId) ?? 0) + cell.n);
    }
  });
  const eligibleCells = gridCells.filter((cell) => cell.value !== null && (categoryCounts.get(cell.categoryId) ?? 0) >= 3);
  const peakCell = eligibleCells.reduce<DrainCell | null>(
    (best, cell) => (!best || (cell.value ?? 0) > (best.value ?? 0) ? cell : best),
    null,
  );
  const quietCell = eligibleCells.reduce<DrainCell | null>(
    (best, cell) => (!best || (cell.value ?? Infinity) < (best.value ?? Infinity) ? cell : best),
    null,
  );

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#FAECE7] text-[11px] text-[#993C1D]">
        Heart-rate response during event windows
      </div>

      <DrainHeatmapGrid
        rows={rows}
        columns={days}
        cells={gridCells}
        maxValue={maxObserved}
        unit="bpm"
        rampLabel={{ low: 'Calm', high: 'Acute' }}
      />

      {(peakCell || quietCell || topDay) && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {peakCell ? (
            <SummaryStat label="Peak" value={`+${peakCell.value} bpm`} sub={peakCell.categoryId} />
          ) : (
            <SummaryStat label="Peak" value="—" sub="not enough data yet" />
          )}
          {quietCell ? (
            <SummaryStat label="Quietest" value={`+${quietCell.value} bpm`} sub={quietCell.categoryId} />
          ) : (
            <SummaryStat label="Quietest" value="—" sub="not enough data yet" />
          )}
          {topDay && (
            <SummaryStat label="Heaviest day" value={topDay.day} sub={`avg +${topDay.total} bpm`} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Burnout Risk tab ─────────────────────────────────────────────────
function BurnoutRiskTab({ matrix }: { matrix: BurnoutMatrix }) {
  const { weeks, dims, cardTrajectory, bannerCopy } = matrix;
  const hrv = dims.find((d) => d.key === 'hrv');
  const bannerStyle =
    cardTrajectory === 'escalating'
      ? 'bg-[#FAECE7] text-[#993C1D]'
      : cardTrajectory === 'improving'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
        : 'bg-muted/40 text-muted-foreground';

  if (!hrv) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Burnout Risk needs HRV history from your wearable. No substitute signal is shown here.
      </p>
    );
  }

  const weekLabels = weeks.slice(-hrv.weekly.length);
  const earlyRead = weekLabels.length < 3;
  const gridCells: DrainCell[] = weekLabels.map((week, index) => ({
    categoryId: 'Overall',
    bucketLabel: week,
    value: hrv.weekly[index] ?? null,
    n: hrv.weekly[index] == null ? 0 : 4,
    topEventLabel: 'HRV trend',
    topEventValue: hrv.weekly[index] ?? undefined,
  }));
  const validValues = hrv.weekly.filter((v): v is number => typeof v === 'number');
  const maxValue = Math.max(5, ...validValues);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Weekly HRV trend
        </div>
        {earlyRead && (
          <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
            Early read
          </span>
        )}
      </div>
      <DrainHeatmapGrid
        rows={['Overall']}
        columns={weekLabels}
        cells={gridCells}
        maxValue={maxValue}
        unit="risk score"
        rampLabel={{ low: 'Low risk', high: 'High risk' }}
        emptyLabel="insufficient HRV days"
      />
      <div className={cn('rounded-md px-2.5 py-2 text-[11px] font-medium', bannerStyle)}>
        {bannerCopy}
      </div>
    </div>
  );
}

// ── Recovery Time tab ────────────────────────────────────────────────
// Shows event types (canonical A–H taxonomy) ranked by how long Heart Rate
// takes to return within ±5% of baseline. Heart Rate (not HRV) is the
// event-window signal — HRV is too coarse for per-event causation.
function RecoveryTimeTab({ data }: { data: RecoveryByEvent }) {
  const { entries, maxRecoveryDays, topEntry } = data;
  if (!entries.length || maxRecoveryDays <= 0) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Need a few more wearable days after meetings to measure recovery time.
      </p>
    );
  }
  const qualifying = entries.filter((entry) => entry.n >= 3);
  const microLocked = entries.filter((entry) => entry.n < 3);

  if (!qualifying.length) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-xs text-muted-foreground/80 text-center">
          Need at least 3 resolved recovery events in one category to show recovery time.
        </p>
        {entries.slice(0, 3).map((entry) => (
          <p key={entry.eventType} className="text-[11px] text-muted-foreground text-center">
            {normalizeCategory(entry.eventType)} — {3 - entry.n} more event{3 - entry.n === 1 ? '' : 's'} needed to show recovery time
          </p>
        ))}
      </div>
    );
  }

  const gridCells: DrainCell[] = qualifying.map((entry) => {
    const bucket = RECOVERY_BUCKETS.find((candidate) => (
      entry.recoveryDays >= candidate.min && entry.recoveryDays < candidate.max
    )) ?? RECOVERY_BUCKETS[RECOVERY_BUCKETS.length - 1];
    return {
      categoryId: normalizeCategory(entry.eventType),
      bucketLabel: bucket.label,
      value: entry.recoveryDays,
      n: entry.n,
      topEventLabel: entry.eventType,
      topEventValue: entry.recoveryDays,
    };
  });

  return (
    <div className="space-y-3">
      <DrainHeatmapGrid
        rows={qualifying.map((entry) => normalizeCategory(entry.eventType))}
        columns={RECOVERY_BUCKETS.map((bucket) => bucket.label)}
        cells={gridCells}
        maxValue={Math.max(maxRecoveryDays, 1)}
        unit="days"
        rampLabel={{ low: 'Fast recovery', high: 'Slow recovery' }}
      />
      {microLocked.map((entry) => (
        <p key={entry.eventType} className="text-[11px] text-muted-foreground">
          {normalizeCategory(entry.eventType)} — {3 - entry.n} more event{3 - entry.n === 1 ? '' : 's'} needed to show recovery time
        </p>
      ))}
      {topEntry && (
        <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Longest recovery: <span className="text-foreground font-medium">{normalizeCategory(topEntry.eventType)}</span>
          {' '}— typically {topEntry.recoveryDays} {topEntry.recoveryDays === 1 ? 'day' : 'days'}.
        </div>
      )}
    </div>
  );
}

// ── Gating prompt (no wearable AND no calendar) ──────────────────────
function GatingPrompt({ hasWearable, hasCalendar }: { hasWearable: boolean; hasCalendar: boolean }) {
  const navigate = useNavigate();
  const both = !hasWearable && !hasCalendar;
  return (
    <div className="py-3 space-y-3">
      <p className="text-sm text-foreground font-medium">
        {both
          ? 'Connect your wearable & calendar to unlock cause and effect.'
          : !hasWearable
            ? 'Add a wearable to fill out this view.'
            : 'Add your calendar to fill out this view.'}
      </p>
      <p className="text-xs text-muted-foreground/85 leading-relaxed">
        This card maps how meeting types and load streaks affect heart rate, recovery, and burnout risk.
        Check-ins alone won&rsquo;t populate it — wearable + calendar data are required.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {!hasWearable && (
          <button
            type="button"
            onClick={() => navigate('/connected-data')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Watch className="h-3.5 w-3.5" /> Connect wearable
          </button>
        )}
        {!hasCalendar && (
          <button
            type="button"
            onClick={() => navigate('/connected-data')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
          >
            <CalendarIcon className="h-3.5 w-3.5" /> Connect calendar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────
const PerformanceCausalityCard = ({ userId }: { userId?: string }) => {
  const [data, setData] = useState<CausalityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [tab, setTab] = useState<'stress' | 'burnout' | 'recovery'>('stress');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrored(false);
      setIsMock(false);
      try {
        const accessToken = await getAuthToken();
        if (!accessToken) {
          if (shouldUsePreviewMock(false)) {
            if (!cancelled) {
              setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
              setIsMock(true);
            }
          } else if (!cancelled) {
            setData(null);
          }
          return;
        }
        const invoke = (force: boolean) =>
          supabase.functions.invoke('cause-effect-engine', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: force ? { force: true } : {},
          });
        const { data: initialResult, error } = await invoke(false);
        let result = initialResult;
        // Force a recompute if the cached payload predates any of the
        // current card projections. This repairs older cached payloads that
        // only had part of the v3/v5 tab contract and would otherwise leave
        // Burnout / Recovery visually blank.
        if (!error && result) {
          const r = result as CausalityPayload;
          const looksOld =
            r.cached === true &&
            (
              !r.stressMatrix ||
              !r.burnoutMatrix ||
              !Object.prototype.hasOwnProperty.call(r, 'recoveryByEvent')
            );
          if (looksOld) {
            const retry = await invoke(true);
            if (!retry.error && retry.data) result = retry.data;
          }
        }
        if (error) {
          if (isPreviewContext()) {
            if (!cancelled) {
              setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
              setIsMock(true);
            }
          } else if (!cancelled) {
            setErrored(true);
          }
          return;
        }
        if (!cancelled) setData(result as CausalityPayload);
      } catch {
        if (isPreviewContext()) {
          if (!cancelled) {
            setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
            setIsMock(true);
          }
        } else if (!cancelled) {
          setErrored(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const cov = data?.coverage;
  const showGating = !!cov && !cov.hasWearable && !cov.hasCalendar;
  const qualifyingRecoveryCount = useMemo(
    () => (data?.recoveryByEvent?.entries ?? []).filter((entry) => entry.n >= 3).length,
    [data?.recoveryByEvent],
  );
  const tabStates = useMemo(() => {
    const checkinCount = cov?.checkinCount ?? 0;
    const wearableDays = cov?.wearableDayCount ?? 0;
    const eventCount = cov?.eventCount ?? 0;
    const bestRecoveryN = Math.max(0, ...(data?.recoveryByEvent?.entries ?? []).map((entry) => entry.n));

    return {
      stress: {
        unlocked: Boolean(cov?.hasCalendar && cov?.hasWearable && checkinCount >= 7 && wearableDays >= 5),
        title: 'Stress Load',
        message:
          !cov?.hasCalendar
            ? 'Stress Load needs your calendar to classify event windows.'
            : !cov?.hasWearable
              ? 'Stress Load needs a wearable with heart-rate samples.'
              : checkinCount < 7
                ? `Stress Load follows the existing causality gate — ${7 - checkinCount} more check-in${7 - checkinCount === 1 ? '' : 's'} needed.`
                : wearableDays < 5
                  ? `Stress Load needs at least 5 wearable days — ${wearableDays} so far.`
                  : eventCount === 0
                    ? 'Stress Load needs calendar events in the current window.'
                    : 'Stress Load is still building.',
        progress: cov?.hasWearable
          ? { current: Math.min(wearableDays, 5), target: 5 }
          : undefined,
      },
      burnout: {
        unlocked: Boolean(cov?.hasWearable && wearableDays >= 7),
        title: 'Burnout Risk',
        message:
          !cov?.hasWearable
            ? 'Burnout Risk needs at least 7 days of wearable history.'
            : `Burnout Risk needs at least 7 days of wearable history — ${wearableDays} so far.`,
        progress: cov?.hasWearable
          ? { current: Math.min(wearableDays, 7), target: 7 }
          : undefined,
      },
      recovery: {
        unlocked: qualifyingRecoveryCount > 0,
        title: 'Recovery Time',
        message: 'Recovery Time unlocks once one category has at least 3 resolved recovery events.',
        progress: bestRecoveryN > 0
          ? { current: Math.min(bestRecoveryN, 3), target: 3 }
          : undefined,
      },
    } as const;
  }, [cov, data?.recoveryByEvent, qualifyingRecoveryCount]);

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            What Drains Your Performance
          </span>
          <div className="flex items-center gap-2">
            {isMock && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/40">
                Preview
              </span>
            )}
            <InsightInfoModal
              title="What Drains Your Performance"
              explanation="How your meeting types and weekly load are showing up in your body. Patterns only appear once there is enough wearable + calendar data."
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : errored ? (
          <div className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Couldn&rsquo;t load this card. Try refreshing.</span>
          </div>
        ) : !data ? (
          <GatingPrompt hasWearable={false} hasCalendar={false} />
        ) : showGating ? (
          <GatingPrompt hasWearable={!!cov?.hasWearable} hasCalendar={!!cov?.hasCalendar} />
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex items-center gap-2">
              <TabPill active={tab === 'stress'} onClick={() => setTab('stress')}>
                Stress Load
              </TabPill>
              <TabPill active={tab === 'burnout'} onClick={() => setTab('burnout')}>
                Burnout Risk
              </TabPill>
              <TabPill active={tab === 'recovery'} onClick={() => setTab('recovery')}>
                Recovery Time
              </TabPill>
            </div>

            {tab === 'stress' ? (
              !tabStates.stress.unlocked ? (
                <LockedTile
                  title={tabStates.stress.title}
                  message={tabStates.stress.message}
                  progress={tabStates.stress.progress}
                />
              ) : data.stressMatrix ? (
                <StressLoadTab matrix={data.stressMatrix} />
              ) : (
                <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                  Need a few more wearable days during meetings to populate.
                </p>
              )
            ) : tab === 'burnout' ? (
              !tabStates.burnout.unlocked ? (
                <LockedTile
                  title={tabStates.burnout.title}
                  message={tabStates.burnout.message}
                  progress={tabStates.burnout.progress}
                />
              ) : data.burnoutMatrix ? (
                <BurnoutRiskTab matrix={data.burnoutMatrix} />
              ) : (
                <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                  Burnout Risk is unlocked, but this chart is still waiting on enough HRV history to render.
                </p>
              )
            ) : !tabStates.recovery.unlocked ? (
              <LockedTile
                title={tabStates.recovery.title}
                message={tabStates.recovery.message}
                progress={tabStates.recovery.progress}
              />
            ) : data.recoveryByEvent ? (
              <RecoveryTimeTab data={data.recoveryByEvent} />
            ) : (
              <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                Need a few more wearable days after meetings to measure recovery time.
              </p>
            )}
          </>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceCausalityCard;
