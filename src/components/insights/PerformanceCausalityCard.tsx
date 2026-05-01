/**
 * Performance Causality Card (v3 — tabbed heatmap)
 *
 * Replaces the prior text-based 4-lens UI with two tabs:
 *   - Stress Load   : per-event-window peak HR delta vs resting baseline
 *   - Burnout Risk  : 4 dims × 5 weeks intensity matrix
 *
 * Sleep Disruption / Recovery Cost are computed silently in the engine and
 * intentionally NOT rendered yet (will be exposed in a follow-up).
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
    weekly: number[];
    trajectory: 'escalating' | 'stable' | 'improving';
  }>;
  cardTrajectory: 'escalating' | 'stable' | 'improving';
  bannerCopy: string;
}
interface Coverage {
  hasCalendar: boolean;
  hasWearable: boolean;
}
interface CausalityPayload {
  coverage: Coverage;
  stressMatrix?: StressMatrix;
  burnoutMatrix?: BurnoutMatrix;
  version?: number;
  cached?: boolean;
}

// ── Coral ramp for Stress Load (from spec; opacity-free hex stops) ───
const CORAL_RAMP = ['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D', '#712B13', '#4A1B0C'];
function coralFor(value: number | null, max: number): { bg: string; fg: string } {
  if (value === null || max <= 0) return { bg: CORAL_RAMP[0], fg: '#7a4632' };
  const t = Math.max(0, Math.min(1, value / max));
  const idx = Math.min(CORAL_RAMP.length - 1, Math.floor(t * CORAL_RAMP.length));
  return { bg: CORAL_RAMP[idx], fg: idx >= 4 ? '#FFF5EE' : '#5b2716' };
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
  const { events, days, cells, n, confidence, maxObserved, topCell, lowCell, topDay } = matrix;
  const hasAny = cells.some((row) => row.some((v) => v !== null));
  if (!hasAny) {
    return (
      <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
        Need a few more wearable days during meetings to populate.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#FAECE7] text-[11px] text-[#993C1D]">
        Heart-rate response during event windows
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[11px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground/70 font-normal pr-2 align-bottom"> </th>
              {events.map((ev) => (
                <th
                  key={ev}
                  title={ev}
                  className="text-muted-foreground/70 font-medium tracking-wide px-1 pb-1 align-bottom min-w-[3.4rem]"
                >
                  <span className="block truncate max-w-[5rem]">{ev}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, r) => (
              <tr key={day}>
                <td className="text-muted-foreground/80 font-medium pr-2 tabular-nums">{day}</td>
                {events.map((ev, c) => {
                  const v = cells[r][c];
                  const { bg, fg } = coralFor(v, maxObserved);
                  return (
                    <td key={`${day}-${ev}`} className="p-0">
                      <div
                        title={
                          v === null
                            ? `${ev} · ${day} — no data yet`
                            : `${ev} · ${day} · n=${n[r][c]}${confidence[r][c] === 'emerging' ? ' · emerging' : ''}`
                        }
                        className="rounded-md flex items-center justify-center h-9 tabular-nums font-medium"
                        style={{ background: bg, color: fg }}
                      >
                        {v === null ? '·' : `+${v}`}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>Calm</span>
        <div className="flex gap-1">
          {CORAL_RAMP.map((c) => (
            <span key={c} className="w-4 h-2.5 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>Acute</span>
      </div>

      {/* 3-stat row */}
      {(topCell || lowCell || topDay) && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {topCell && (
            <div className="rounded-md bg-muted/30 px-2 py-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Peak</div>
              <div className="text-sm font-medium tabular-nums">+{topCell.value}<span className="text-[10px] text-muted-foreground/70 ml-0.5">bpm</span></div>
              <div className="text-[10px] text-muted-foreground/70 truncate">{topCell.event}</div>
            </div>
          )}
          {lowCell && (
            <div className="rounded-md bg-muted/30 px-2 py-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Quietest</div>
              <div className="text-sm font-medium tabular-nums">+{lowCell.value}<span className="text-[10px] text-muted-foreground/70 ml-0.5">bpm</span></div>
              <div className="text-[10px] text-muted-foreground/70 truncate">{lowCell.event}</div>
            </div>
          )}
          {topDay && (
            <div className="rounded-md bg-muted/30 px-2 py-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Heaviest day</div>
              <div className="text-sm font-medium">{topDay.day}</div>
              <div className="text-[10px] text-muted-foreground/70 tabular-nums">avg +{topDay.total} bpm</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Burnout Risk tab ─────────────────────────────────────────────────
function BurnoutRiskTab({ matrix }: { matrix: BurnoutMatrix }) {
  const { weeks, dims, cardTrajectory, bannerCopy } = matrix;
  const bannerStyle =
    cardTrajectory === 'escalating'
      ? 'bg-[#FAECE7] text-[#993C1D]'
      : cardTrajectory === 'improving'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
        : 'bg-muted/40 text-muted-foreground';
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Weekly view
      </div>
      <div className="space-y-2">
        {dims.map((d) => (
          <div key={d.key} className="flex items-center gap-2">
            <div className="w-24 text-[11px] text-muted-foreground/80 truncate" title={d.label}>
              {d.label}
            </div>
            <div className="flex-1 grid grid-cols-5 gap-1">
              {d.weekly.map((v, i) => (
                <div
                  key={i}
                  title={`${weeks[i]} · level ${v}/5`}
                  className="h-6 rounded-sm"
                  style={{
                    background: d.color,
                    opacity: 0.1 + (Math.max(1, Math.min(5, v)) / 5) * 0.9,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 pl-[6.5rem] text-[9px] uppercase tracking-widest text-muted-foreground/60">
        {weeks.map((w, i) => (
          <div key={i} className="truncate text-center">{i === 0 ? '4w ago' : i === 4 ? 'This wk' : `${4 - i}w ago`}</div>
        ))}
      </div>
      <div className={cn('rounded-md px-2.5 py-2 text-[11px] font-medium', bannerStyle)}>
        {bannerCopy}
      </div>
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
        let { data: result, error } = await invoke(false);
        // Force a recompute if the cached payload predates v3 (no matrices).
        if (!error && result) {
          const r = result as CausalityPayload;
          const looksOld = !r.stressMatrix && !r.burnoutMatrix && r.cached === true;
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
  const partialBanner = useMemo(() => {
    if (!cov || (cov.hasWearable && cov.hasCalendar)) return null;
    if (!cov.hasWearable && !cov.hasCalendar) return null;
    return cov.hasWearable
      ? 'Add your calendar to fill out this view.'
      : 'Add a wearable to fill out this view.';
  }, [cov]);

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Performance Causality
          </span>
          <div className="flex items-center gap-2">
            {isMock && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/40">
                Preview
              </span>
            )}
            <InsightInfoModal
              title="Performance Causality"
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
            </div>

            {partialBanner && (
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                {partialBanner}
              </div>
            )}

            {tab === 'stress' ? (
              data.stressMatrix ? (
                <StressLoadTab matrix={data.stressMatrix} />
              ) : (
                <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                  Need a few more wearable days during meetings to populate.
                </p>
              )
            ) : data.burnoutMatrix ? (
              <BurnoutRiskTab matrix={data.burnoutMatrix} />
            ) : (
              <p className="text-xs text-muted-foreground/80 py-6 px-1 text-center">
                Need a few more weeks of wearable + calendar data to populate.
              </p>
            )}
          </>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceCausalityCard;
