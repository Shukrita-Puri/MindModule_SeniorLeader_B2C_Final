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
                  const displayValue =
                    value === null
                      ? '·'
                      : unit === 'bpm'
                        ? `+${Math.round(value)}`
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
                      ? `\n${cell.topEventLabel} · ${unit === 'bpm' ? '+' : ''}${cell.topEventValue} ${unit}`
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
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        Each column is a past week, not a forecast. Higher intensity means that week sat deeper in your own HRV strain range versus your personal baseline.
      </p>
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
          <div className="space-y-4">
            {/* Shared section title sits above the sub-card, below the card header */}
            <div className="flex items-start gap-2">
              <span className="text-[13px] font-semibold tracking-wide uppercase text-primary/80 font-body leading-tight">
                Mental Performance Patterns
              </span>
            </div>

            {/* Section A — physiology and demand patterns */}
            <div className="rounded-xl p-3.5 space-y-4 bg-muted/30 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-2">
                <span className="text-sm font-semibold text-primary/80 leading-tight flex-shrink-0">A.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Based on Physiology x Demand data
                  </p>
                </div>
              </div>

              {/* Tab bar */}
              <SegmentedToggle
                ariaLabel="Drain lens"
                value={tab}
                onChange={(v) => setTab(v)}
                options={[
                  { value: 'stress', label: 'Stress Load' },
                  { value: 'burnout', label: 'Burnout Risk' },
                  { value: 'recovery', label: 'Recovery Time' },
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
          </div>
        </div>
      )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceCausalityCard;
