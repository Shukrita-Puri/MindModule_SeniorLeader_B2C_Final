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
import InsightShareSlot from '@/components/insights/InsightShareSlot';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { shouldUsePreviewMock, isPreviewContext } from '@/utils/previewAuth';
import { MOCK_CAUSALITY_PAYLOAD } from '@/components/insights/causalityMockData';
import { cn } from '@/lib/utils';
import SegmentedToggle from '@/components/insights/SegmentedToggle';
import { EVENT_CATEGORY_NAMES, CANONICAL_CATEGORY_LABELS } from '@/lib/events/categories';

// ── Types (mirror engine output, payload-only fields) ────────────────
type Confidence = 'strong' | 'emerging';
interface StressMatrix {
  events: string[];
  categoryNames?: string[];
  days: string[];
  cells: (number | null)[][];
  n: number[][];
  /** Subtype label of the event that produced each cell's peak value. */
  subLabels?: (string | null)[][];
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
interface DiagnosticsCounts {
  hrvDays?: number;
  hrSamplesDays?: number;
}
interface CausalityPayload {
  coverage: Coverage;
  stressMatrix?: StressMatrix;
  burnoutMatrix?: BurnoutMatrix;
  recoveryByEvent?: RecoveryByEvent | null;
  diagnostics?: {
    counts?: DiagnosticsCounts;
  };
  /**
   * Additive subset of the engine's `signal_summary` — Stress Load renders
   * `subcategory_lift` as a secondary line under any A–H row that spans
   * ≥2 subcategories with n≥2 each. Missing/empty → render nothing.
   */
  signalSummary?: {
    subcategory_lift?: Array<{
      categoryId: string;
      categoryName: string;
      subcategoryId: string;
      hrDeltaBpm: number;
      n: number;
    }>;
  };
  /** v13 — additive Day Type × next-day HRV impact. Optional so older cached payloads still render. */
  dayTypeHrvMatrix?: DayTypeHrvMatrix | null;
  version?: number;
  cached?: boolean;
}

// ── v13: Day Type × HRV Impact ───────────────────────────────────────
interface DayTypeHrvCell {
  hrvDelta: number | null;
  n: number;
  confidence: Confidence | null;
  hasData: boolean;
}
/** v14 — one row per calendar day with events, bucketed by ISO week. */
interface DayTypeWeekRow {
  dayType: string;
  dayOfWeek: number;
  dayLabel: string;
  date: string;
  hrvDelta: number | null;
  hasNextDayHrv: boolean;
  /** Events on that date that fed the dominant-day-type classification. */
  eventCount?: number;
}
interface DayTypeWeeklyDeltas {
  weekLabel: string;
  weekStart: string;
  rows: DayTypeWeekRow[];
}
interface DayTypeHrvMatrix {
  dayTypes: string[];
  days: string[];
  cells: DayTypeHrvCell[][];
  hrvBaseline: number | null;
  maxAbsDelta: number;
  bannerCopy: string;
  weeklyDeltas?: DayTypeWeeklyDeltas[];
  streakSummary: {
    currentStreakDays: number;
    currentStreakType: string | null;
    streakHrvDeltaMean: number | null;
  } | null;
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

// Legacy alias → canonical A–H pillar name. Canonical names come from the
// single frontend mirror (src/lib/events/categories.ts), which is generated
// from the backend SSOT and guarded by a conformance test — never hardcode
// a pillar name here.
const C = EVENT_CATEGORY_NAMES;
const CATEGORY_LABELS: Record<string, string> = {
  'Board reviews': C.A,
  'Board / governance': C.A,
  'Board governance': C.A,
  Governance: C.A,
  'Investor calls': C.A,
  'Sales / pitches': C.B,
  'Town halls': C.C,
  'Client meetings': C.C,
  'Small-group session': C.C,
  'Small-group sessions': C.C,
  Visibility: C.C,
  '1:1s': C.D,
  'Catch-up': C.D,
  'Catch-ups': C.D,
  'Catch-ups & syncs': C.D,
  'Relationship / 1:1': C.D,
  Networking: C.D,
  'Networking & com...': C.D,
  Interviews: C.D,
  Hiring: C.D,
  'Deep work': C.E,
  'Solo work block': C.E,
  'Solo work blocks': C.E,
  'Deep Work': C.E,
  Conferences: C.F,
  'School & family': C.H,
  Personal: C.H,
  // Canonical names map to themselves.
  ...Object.fromEntries(CANONICAL_CATEGORY_LABELS.map((n) => [n, n])),
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
        <table className="w-max min-w-full text-[11px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-background text-left text-muted-foreground/70 font-normal pr-2 align-bottom"> </th>
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
                <td className="sticky left-0 z-10 bg-background text-muted-foreground/80 font-medium pr-2">
                  {/* Frozen label column: stays put while the day columns scroll,
                      and scrolls on its own axis so long names read in full. */}
                  <span
                    className="block whitespace-nowrap overflow-x-auto max-w-[7.5rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    title={row}
                  >
                    {row}
                  </span>
                </td>

                {columns.map((column) => {
                  const cell = cellMap.get(`${row}::${column}`);
                  const value = cell?.value ?? null;
                  const { bg, fg } = coralFor(value, maxValue);
                  // Signed formatting: mean-HR deltas can be negative (an
                  // event that sat below the trailing resting baseline).
                  const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
                  const displayValue =
                    value === null
                      ? '·'
                      : unit === 'bpm'
                        ? signed(value)
                        : unit === 'days'
                          ? `${value}`
                          : `${Math.round(value)}`;
                  // The row category is already visible on the left, so the
                  // tooltip explains the sample size and names the event
                  // subtype behind the cell's peak instead of repeating it.
                  const topLine =
                    value === null || !cell
                      ? `${column} — ${emptyLabel}`
                      : `${column} · ${cell.n} event${cell.n === 1 ? '' : 's'} with HR samples`;
                  const eventLine =
                    cell?.topEventLabel && cell.topEventValue != null
                      ? `\n${cell.topEventLabel} · ${unit === 'bpm' ? signed(cell.topEventValue) : cell.topEventValue} ${unit}`
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
    <div className="rounded-xl bg-muted/20 px-3 py-4 space-y-2">
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


// ── Stress Load tab ──────────────────────────────────────────────────
type SubcategoryLiftEntry = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  hrDeltaBpm: number;
  n: number;
};

function StressLoadTab({
  matrix,
  subcategoryLift,
}: {
  matrix: StressMatrix;
  subcategoryLift?: SubcategoryLiftEntry[];
}) {
  const { events, categoryNames, days, cells, n, subLabels, maxObserved, topDay } = matrix;
  // Always render a full Mon–Sun week: Sunday is a working day in Israel and
  // the Gulf. Days the payload doesn't cover render as neutral empty cells.
  const WEEK_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekColumns = WEEK_COLUMNS.concat(days.filter((d) => !WEEK_COLUMNS.includes(d)));
  const hasAny = cells.some((row) => row.some((v) => v !== null));
  if (!hasAny) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Need a few more wearable days during meetings to populate.
      </p>
    );
  }

  const categoryForEvent = (event: string, eventIndex: number) =>
    normalizeCategory(categoryNames?.[eventIndex] || event);
  const rows = Array.from(new Set(events.map((event, eventIndex) => categoryForEvent(event, eventIndex))));
  const aggregatedCells = new Map<string, DrainCell>();
  days.forEach((day, dayIndex) => {
    events.forEach((event, eventIndex) => {
      const value = cells[dayIndex]?.[eventIndex] ?? null;
      const categoryId = categoryForEvent(event, eventIndex);
      const count = n[dayIndex]?.[eventIndex] ?? 0;
      // Prefer the resolved event subtype; fall back to the column label.
      const subLabel = subLabels?.[dayIndex]?.[eventIndex] || event;
      const key = `${categoryId}::${day}`;
      const existing = aggregatedCells.get(key);
      if (!existing) {
        aggregatedCells.set(key, {
          categoryId,
          bucketLabel: day,
          value,
          n: count,
          topEventLabel: subLabel,
          topEventValue: value ?? undefined,
        });
        return;
      }
      existing.n += count;
      if (value !== null && (existing.value === null || value > existing.value)) {
        existing.value = value;
        existing.topEventLabel = subLabel;
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
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Heart Rate x Event trend
      </div>
      <DrainHeatmapGrid
        rows={rows}
        columns={weekColumns}
        cells={gridCells}
        maxValue={maxObserved}
        unit="bpm"
        rampLabel={{ low: 'Lower', high: 'Higher' }}
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

      {(() => {
        // Additive subcategory breakdown. Render only when at least one
        // A–H row shown above has ≥2 subcategories, each with n≥2.
        const list = (subcategoryLift ?? []).filter((e) => e && e.n >= 2);
        if (list.length === 0) return null;
        const visibleRows = new Set(rows);
        const byCategory = new Map<string, SubcategoryLiftEntry[]>();
        list.forEach((entry) => {
          const rowLabel = normalizeCategory(entry.categoryName);
          if (!visibleRows.has(rowLabel)) return;
          const bucket = byCategory.get(rowLabel) ?? [];
          bucket.push(entry);
          byCategory.set(rowLabel, bucket);
        });
        const eligible = Array.from(byCategory.entries()).filter(
          ([, entries]) => entries.length >= 2,
        );
        if (eligible.length === 0) return null;
        return (
          <div className="space-y-1 pt-2 border-t border-border/0">
            {eligible.map(([rowLabel, entries]) => (
              <div key={rowLabel} className="text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/80">{rowLabel}:</span>{' '}
                {entries
                  .slice()
                  .sort((a, b) => a.hrDeltaBpm - b.hrDeltaBpm)
                  .map((entry) => {
                    const sign = entry.hrDeltaBpm >= 0 ? '+' : '−';
                    const val = Math.abs(entry.hrDeltaBpm);
                    return `${entry.subcategoryId.replace(/_/g, ' ')} ${sign}${val} bpm (n=${entry.n})`;
                  })
                  .join(' · ')}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ── Burnout Risk tab ─────────────────────────────────────────────────
function BurnoutRiskTab({ matrix }: { matrix: BurnoutMatrix }) {
  const { weeks, dims, bannerCopy } = matrix;
  const hrv = dims.find((d) => d.key === 'hrv');


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
      {bannerCopy && (
        <p className="text-[11px] leading-snug text-foreground/80">{bannerCopy}</p>
      )}

    </div>
  );
}

// ── v14: Day Type × HRV Impact (Burnout Risk tab, section A) ─────────
// Two views over `weeklyDeltas` only: Day Wise (current week + scrollable
// history) and Monthly (client-side 30-day means). `cells` is not rendered.

const DAY_WISE_LABELS: Record<string, string> = {
  'Last week': 'Last week',
  '2 wks ago': '2 weeks ago',
  '3 wks ago': '3 weeks ago',
  '4 wks ago': '4 weeks ago',
};

const signedMs = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}ms`;

type GridCellRender = {
  key: string;
  tooltip: string;
  label: string | null;
  sublabel?: string | null;
  state: 'value' | 'thin' | 'muted' | 'empty';
  bg?: string;
  fg?: string;
};

function DayTypeGrid({
  dayTypes,
  days,
  cellFor,
}: {
  dayTypes: string[];
  days: string[];
  cellFor: (dayType: string, dayIdx: number, day: string) => GridCellRender;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-max min-w-full text-[10px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-background text-left text-muted-foreground/70 font-normal pr-2 align-bottom"> </th>
            {days.map((d) => (
              <th
                key={d}
                className="text-[9px] text-muted-foreground/70 font-medium tracking-wide px-1 pb-1 align-bottom min-w-[3.4rem]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dayTypes.map((type) => (
            <tr key={type}>
              <td className="sticky left-0 z-10 bg-background text-muted-foreground/80 font-medium pr-2 text-[10px]">
                <span
                  className="block whitespace-nowrap overflow-x-auto max-w-[7.5rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  title={type}
                >
                  {type}
                </span>
              </td>
              {days.map((day, colIdx) => {
                const cell = cellFor(type, colIdx, day);
                return (
                  <td key={cell.key} className="p-0">
                    <div
                      title={cell.tooltip}
                      className={cn(
                        'h-9 rounded-md flex flex-col items-center justify-center tabular-nums font-medium leading-none transition-colors text-[10px]',
                        cell.state === 'empty' && 'bg-white/60 dark:bg-white/5 text-muted-foreground/30',
                        cell.state === 'muted' &&
                          'bg-muted/40 border border-border/60 text-muted-foreground/70',
                        cell.state === 'thin' && 'bg-muted/50 text-muted-foreground',
                      )}
                      style={
                        cell.state === 'value' ? { background: cell.bg, color: cell.fg } : undefined
                      }
                    >
                      {cell.label ?? ''}
                      {cell.sublabel && (
                        <span className="text-[7px] text-muted-foreground/70 mt-0.5">
                          {cell.sublabel}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RampLegend() {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
      <span>Lower Impact</span>
      <div className="flex gap-1">
        {CORAL_RAMP.map((c) => (
          <span key={c} className="w-4 h-2.5 rounded-sm" style={{ background: c }} />
        ))}
      </div>
      <span>Higher Impact</span>
    </div>
  );
}

function DayTypeHrvSection({
  matrix,
  view,
}: {
  matrix?: DayTypeHrvMatrix | null;
  view: 'day' | 'month';
}) {
  if (!matrix) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Connect your wearable and check back in a few days — this chart needs at least 5 HRV
        readings to start.
      </p>
    );
  }

  const { dayTypes, days, hrvBaseline, maxAbsDelta, bannerCopy, streakSummary } = matrix;
  const weekly = matrix.weeklyDeltas ?? [];
  const baselineLabel = hrvBaseline ?? '—';

  // Cost-scaled ramp: suppression (negative delta) reads dark, recovery light.
  const rampScore = (delta: number, max: number) => (max > 0 ? (max - delta) / 2 : 0);

  const thisWeek = weekly.find((w) => w.weekLabel === 'This week');
  const previousWeeks = weekly.filter((w) => w.weekLabel !== 'This week').slice().reverse();

  const rowsOf = (weekRows: DayTypeWeekRow[]) => {
    const present = dayTypes.filter((t) => weekRows.some((r) => r.dayType === t));
    const extra = [...new Set(weekRows.map((r) => r.dayType))].filter((t) => !dayTypes.includes(t));
    const list = [...present, ...extra];
    return list.length ? list : dayTypes;
  };

  const dayWiseCell =
    (weekRows: DayTypeWeekRow[], allowPending: boolean) =>
    (type: string, colIdx: number, day: string): GridCellRender => {
      const row = weekRows.find((r) => r.dayType === type && r.dayOfWeek === colIdx);
      const key = `${type}-${day}`;
      if (!row) {
        return { key, tooltip: `${type} ${day}s — no data yet`, label: null, state: 'empty' };
      }
      const countLine =
        typeof row.eventCount === 'number' ? `${type} — ${row.eventCount} events today` : type;
      if (!row.hasNextDayHrv || row.hrvDelta === null) {
        if (!allowPending) {
          return { key, tooltip: `${type} ${day}s — no data yet`, label: null, state: 'empty' };
        }
        return {
          key,
          tooltip: `${countLine}\nNext-day HRV: not yet recorded`,
          label: null,
          sublabel: 'pending',
          state: 'muted',
        };
      }
      const { bg, fg } = coralFor(rampScore(row.hrvDelta, maxAbsDelta), maxAbsDelta);
      return {
        key,
        tooltip: `${countLine}\nNext-day HRV: ${signedMs(row.hrvDelta)} vs your ${baselineLabel}ms baseline`,
        label: signedMs(row.hrvDelta),
        state: 'value',
        bg,
        fg,
      };
    };

  // ── Monthly view: client-side 30-day means over the four completed weeks ──
  const monthlyRows = weekly
    .filter((w) => w.weekLabel !== 'This week')
    .flatMap((w) => w.rows)
    .filter((r) => r.hasNextDayHrv && r.hrvDelta !== null);

  const monthlyMap = new Map<string, { sum: number; n: number }>();
  for (const r of monthlyRows) {
    const k = `${r.dayType}|${r.dayOfWeek}`;
    const prev = monthlyMap.get(k) ?? { sum: 0, n: 0 };
    monthlyMap.set(k, { sum: prev.sum + (r.hrvDelta as number), n: prev.n + 1 });
  }
  const monthlyValue = (type: string, colIdx: number) => {
    const agg = monthlyMap.get(`${type}|${colIdx}`);
    if (!agg || agg.n === 0) return null;
    return { value: Math.round(agg.sum / agg.n), n: agg.n };
  };
  const monthlyTypes = (() => {
    const present = dayTypes.filter((t) => days.some((_, i) => monthlyValue(t, i)));
    return present.length ? present : dayTypes;
  })();
  const monthlyMax = Math.max(
    0,
    ...monthlyTypes.flatMap((t) =>
      days.map((_, i) => {
        const v = monthlyValue(t, i);
        return v ? Math.abs(v.value) : 0;
      }),
    ),
  );
  const monthlyCell = (type: string, colIdx: number, day: string): GridCellRender => {
    const key = `${type}-${day}`;
    const agg = monthlyValue(type, colIdx);
    if (!agg) {
      return { key, tooltip: `${type} ${day}s — no data yet`, label: null, state: 'empty' };
    }
    const tooltip = `${type} ${day}s — ${agg.n} occurrence${agg.n === 1 ? '' : 's'}\nAverage next-day HRV: ${signedMs(agg.value)} vs your ${baselineLabel}ms baseline`;
    if (agg.n < 3) {
      return { key, tooltip, label: signedMs(agg.value), state: 'thin' };
    }
    const { bg, fg } = coralFor(rampScore(agg.value, monthlyMax), monthlyMax);
    return { key, tooltip, label: signedMs(agg.value), state: 'value', bg, fg };
  };

  const anyData = weekly.some((w) => w.rows.length > 0);

  return (
    <div className="space-y-3">
      {view === 'day' ? (
        <div className="space-y-3">
          <div className="overflow-x-auto flex snap-x snap-mandatory scroll-smooth -mx-1 px-1">
            {[
              { key: 'This week', label: 'This week', rows: thisWeek?.rows ?? [] },
              ...previousWeeks
                .filter((w) => w.rows.length > 0)
                .map((w) => ({
                  key: w.weekLabel,
                  label: DAY_WISE_LABELS[w.weekLabel] ?? w.weekLabel,
                  rows: w.rows,
                })),
            ].map((p) => (
              <div key={p.key} className="w-full flex-shrink-0 snap-start space-y-1.5 px-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
                  {p.label}
                </p>
                <DayTypeGrid
                  dayTypes={rowsOf(p.rows)}
                  days={days}
                  cellFor={dayWiseCell(p.rows, p.key === 'This week')}
                />
              </div>
            ))}
          </div>
          <RampLegend />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
            Last 30 days
          </p>
          <DayTypeGrid dayTypes={monthlyTypes} days={days} cellFor={monthlyCell} />
          <RampLegend />
        </div>
      )}

      {bannerCopy && (
        <p className="text-[11px] leading-snug text-foreground/80">{bannerCopy}</p>
      )}
      {streakSummary && streakSummary.currentStreakDays >= 2 && (
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          {streakSummary.streakHrvDeltaMean === null
            ? `Currently on day ${streakSummary.currentStreakDays} of a ${streakSummary.currentStreakType} streak — next-day HRV not yet recorded.`
            : `Currently on day ${streakSummary.currentStreakDays} of a ${streakSummary.currentStreakType} streak — next-day HRV averaging ${signedMs(streakSummary.streakHrvDeltaMean)} vs your baseline.`}
        </p>
      )}

      {!anyData && (
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          Your day type patterns will appear here as your week unfolds.
        </p>
      )}
    </div>
  );
}

/** Sub-card A shell: title + info + Day Wise / Monthly toggle on one line. */
function DayTypeHrvCard({ matrix }: { matrix?: DayTypeHrvMatrix | null }) {
  const [view, setView] = useState<'day' | 'month'>('day');
  return (
    <div className="card-standard rounded-xl p-3.5 bg-surface-muted/40 shadow-sm border-0">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            DAY TYPE IMPACT ON BURNOUT
          </p>
          <InsightInfoModal
            title="Day type impact on burnout"
            explanation="This chart shows how different types of days affect your physiological recovery overnight. Each cell reflects the change in next-day HRV for that day type. Darker cells indicate greater impact on recovery."
          />
        </div>
        <SegmentedToggle
          size="compact"
          value={view}
          onChange={(v) => setView(v)}
          ariaLabel="Day type view"
          options={[
            { value: 'day' as const, label: 'Day' },
            { value: 'month' as const, label: 'Monthly' },
          ]}
        />
      </div>
      <DayTypeHrvSection matrix={matrix} view={view} />
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
  const qualifying = entries.filter((entry) => entry.n >= 2);
  const microLocked = entries.filter((entry) => entry.n < 2);

  if (!qualifying.length) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-xs text-muted-foreground/80 text-center">
          Need at least 2 resolved recovery events in one category to show recovery time.
        </p>
        {entries.slice(0, 3).map((entry) => (
          <p key={entry.eventType} className="text-[11px] text-muted-foreground text-center">
            {normalizeCategory(entry.eventType)} — {2 - entry.n} more event{2 - entry.n === 1 ? '' : 's'} needed to show recovery time
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
          {normalizeCategory(entry.eventType)} — {2 - entry.n} more event{2 - entry.n === 1 ? '' : 's'} needed to show recovery time
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
  const [tab, setTab] = useState<'stress' | 'burnout'>('stress');

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
    () => (data?.recoveryByEvent?.entries ?? []).filter((entry) => entry.n >= 2).length,
    [data?.recoveryByEvent],
  );
  const tabStates = useMemo(() => {
    const checkinCount = cov?.checkinCount ?? 0;
    const wearableDays = cov?.wearableDayCount ?? 0;
    const hrvDays = data?.diagnostics?.counts?.hrvDays ?? wearableDays;
    const hrSamplesDays = data?.diagnostics?.counts?.hrSamplesDays ?? wearableDays;
    const eventCount = cov?.eventCount ?? 0;
    const bestRecoveryN = Math.max(0, ...(data?.recoveryByEvent?.entries ?? []).map((entry) => entry.n));

    return {
      stress: {
        unlocked: Boolean(cov?.hasCalendar && cov?.hasWearable && checkinCount >= 7 && hrSamplesDays >= 5),
        title: 'Stress Load',
        message:
          !cov?.hasCalendar
            ? 'Stress Load needs your calendar to classify event windows.'
            : !cov?.hasWearable
              ? 'Stress Load needs a wearable with heart-rate samples.'
              : checkinCount < 7
                ? `Stress Load follows the existing causality gate — ${7 - checkinCount} more check-in${7 - checkinCount === 1 ? '' : 's'} needed.`
                : hrSamplesDays < 5
                  ? `Stress Load needs at least 5 days with intraday heart-rate samples — ${hrSamplesDays} so far.`
                  : eventCount === 0
                    ? 'Stress Load needs calendar events in the current window.'
                    : 'Stress Load is still building.',
        progress: cov?.hasWearable
          ? { current: Math.min(hrSamplesDays, 5), target: 5 }
          : undefined,
      },
      burnout: {
        unlocked: Boolean(cov?.hasWearable && hrvDays >= 7),
        title: 'Burnout Risk',
        message:
          !cov?.hasWearable
            ? 'Burnout Risk needs at least 7 HRV days from your wearable.'
            : `Burnout Risk needs at least 7 HRV days — ${hrvDays} so far.`,
        progress: cov?.hasWearable
          ? { current: Math.min(hrvDays, 7), target: 7 }
          : undefined,
      },
      recovery: {
        unlocked: qualifyingRecoveryCount > 0,
        title: 'Recovery Time',
        message: 'Recovery Time unlocks once one category has at least 2 resolved recovery events.',
        progress: bestRecoveryN > 0
          ? { current: Math.min(bestRecoveryN, 2), target: 2 }
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
            <InsightShareSlot />
            <InsightInfoModal
              title="What Drains Your Performance"
              explanation="A. Based on Physiology x Demand data. How your meeting types and weekly load are showing up in your body. Patterns only appear once there is enough wearable + calendar data."
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
          <div className="space-y-4">
            {/* Section A — physiology and demand patterns */}
            <div className="rounded-xl p-3.5 space-y-4 bg-muted/30 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {/* Tab bar */}
              <SegmentedToggle
                ariaLabel="Drain lens"
                value={tab}
                onChange={(v) => setTab(v)}
                options={[
                  { value: 'stress', label: 'Stress Load' },
                  { value: 'burnout', label: 'Burnout Risk' },
                ]}
              />

              {tab === 'stress' ? (
              !tabStates.stress.unlocked ? (
                <LockedTile
                  title={tabStates.stress.title}
                  message={tabStates.stress.message}
                  progress={tabStates.stress.progress}
                />
              ) : data.stressMatrix ? (
                <StressLoadTab
                  matrix={data.stressMatrix}
                  subcategoryLift={data.signalSummary?.subcategory_lift}
                />
              ) : (
                <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                  Need a few more wearable days during meetings to populate.
                </p>
              )
            ) : (
              <div className="space-y-4">
                {/* A. Day Type impact on burnout (v14 — weekly / monthly views) */}
                <DayTypeHrvCard matrix={data.dayTypeHrvMatrix} />


                {/* B. Existing weekly HRV trend — contents untouched */}
                <div className="card-standard rounded-xl p-3.5 bg-surface-muted/40 shadow-sm border-0">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      WEEKLY BURNOUT TREND
                    </p>
                    <InsightInfoModal
                      title="Weekly burnout trend"
                      explanation="This chart tracks four weekly signals — calendar load, resting heart rate trend, HRV trend, and sleep deficit — to show how your burnout risk has shifted over the past five weeks. Higher intensity means that week sat deeper in your personal strain range."
                    />
                  </div>

                  {!tabStates.burnout.unlocked ? (
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
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceCausalityCard;
