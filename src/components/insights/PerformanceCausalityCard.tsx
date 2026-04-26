/**
 * Performance Causality Card (formerly "Cause & Effect")
 *
 * One card. Top finding always visible. 4 chevron-revealed lenses underneath.
 * Every row is a visual delta-bar — no paragraph findings, no sub-headers.
 *
 * Data: cause-effect-engine edge function (cached per day in causality_findings).
 * Auth: Auth0 token via getAuthToken; DEV bypass falls through to a friendly state.
 */

import { useEffect, useState } from 'react';
import { Loader2, ChevronDown, HeartPulse, Brain, Moon, Layers, ArrowRight, AlertTriangle } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { shouldUsePreviewMock, isPreviewContext } from '@/utils/previewAuth';
import { MOCK_CAUSALITY_PAYLOAD } from '@/components/insights/causalityMockData';
import { cn } from '@/lib/utils';

// ── Types (mirror engine output) ─────────────────────────────────────
type Lens = 'A' | 'B' | 'C' | 'D';
type Direction = 'negative' | 'positive';
type Confidence = 'strong' | 'emerging';

interface Finding {
  lens: Lens;
  cause: string;
  effectSignal: string;
  unit: string;
  baseline: number;
  observed: number;
  deltaAbs: number;
  deltaPct: number;
  n: number;
  recoveryDays: number | null;
  direction: Direction;
  confidence?: Confidence;
  longText: string;
}

interface Coverage {
  hasCalendar: boolean;
  hasWearable: boolean;
  hasWearableSleep?: boolean;
  checkinCount: number;
  briefCount: number;
  wearableDayCount: number;
  eventCount: number;
  eventTypesIdentified?: number;
}

interface CausalityPayload {
  top: Finding | null;
  lensA: Finding[];
  lensB: Finding[];
  lensC: Finding[];
  lensD: Finding[];
  coverage: Coverage;
  generatedAt: string;
}

interface Props {
  userId?: string;
}

// ── Visual finding row (delta-bar) ───────────────────────────────────
function FindingRow({ f }: { f: Finding }) {
  const isCost = f.deltaAbs < 0 || (f.effectSignal === 'RHR' && f.deltaAbs > 0);
  // Bar fill is bounded for visual clarity
  const fillPct = Math.min(Math.abs(f.deltaPct), 60); // cap visual scale at 60%
  const formatValue = (v: number) => {
    if (f.unit === 'tier') return `${v.toFixed(1)}/5`;
    if (f.unit === 'pts') return `${Math.round(v)} pts`;
    return `${Math.round(v)}${f.unit}`;
  };
  const sign = f.deltaPct > 0 ? '+' : '';
  return (
    <div className="py-2.5">
      {/* Top row: cause → signal · delta · n */}
      <div className="flex items-center gap-2 mb-1.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
          {f.cause}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs text-muted-foreground tracking-wide flex-shrink-0">
          {f.effectSignal}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded flex-shrink-0',
            isCost ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10'
          )}
        >
          {sign}{f.deltaPct.toFixed(0)}%
        </span>
        {f.confidence === 'emerging' && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 flex-shrink-0">
            Emerging
          </span>
        )}
      </div>
      {/* Delta bar */}
      <div className="relative h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all',
            isCost ? 'bg-red-500/70' : 'bg-emerald-500/70'
          )}
          style={{ width: `${fillPct + 5}%` }}
        />
      </div>
      {/* Footer: baseline → observed · recovery · n */}
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span>
          Baseline {formatValue(f.baseline)}
          <span className="mx-1.5 text-muted-foreground/40">→</span>
          {formatValue(f.observed)}
        </span>
        <span className="flex items-center gap-2">
          {f.recoveryDays != null && (
            <span className="text-muted-foreground/80">
              ~{f.recoveryDays}d to recover
            </span>
          )}
          <span className="text-muted-foreground/60">n={f.n}</span>
        </span>
      </div>
    </div>
  );
}

// ── Collapsible lens section ─────────────────────────────────────────
interface LensProps {
  icon: typeof HeartPulse;
  title: string;
  findings: Finding[];
  emptyMessage: string;
  defaultOpen?: boolean;
}
function LensSection({ icon: Icon, title, findings, emptyMessage, defaultOpen = false }: LensProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasFindings = findings.length > 0;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group w-full flex items-center justify-between py-2.5 px-1 hover:bg-muted/20 rounded-md transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
          <span className="text-xs font-medium tracking-wide text-foreground/80 text-left">
            {title}
          </span>
          {hasFindings && (
            <span className="text-[10px] tabular-nums text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/30">
              {findings.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground/60 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-1">
        {hasFindings ? (
          <div className="divide-y divide-border/30">
            {findings.map((f, i) => (
              <FindingRow key={`${f.lens}-${f.cause}-${f.effectSignal}-${i}`} f={f} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 py-3 px-1">{emptyMessage}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Card ─────────────────────────────────────────────────────────────
const PerformanceCausalityCard = ({ userId }: Props) => {
  const [data, setData] = useState<CausalityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    // Always attempt to fetch — the function itself decides between real
    // data, preview mock, or honest empty state.
    fetchPayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchPayload = async () => {
    setLoading(true);
    setErrored(false);
    setIsMock(false);
    try {
      const accessToken = await getAuthToken();
      if (!accessToken) {
        // No auth token. In a preview context (Lovable iframe / *.lovable.app
        // / DEV_MODE) we render mock causality data so reviewers see the
        // intended UI. Outside preview, fall back to honest empty state.
        if (shouldUsePreviewMock(false)) {
          setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
          setIsMock(true);
        } else {
          setData(null);
        }
        return;
      }
      const { data: result, error } = await supabase.functions.invoke('cause-effect-engine', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        console.error('[PerformanceCausalityCard] invoke error:', error);
        // In preview, prefer showing mock data over an error toast so the
        // page still demos correctly when the edge function isn't reachable.
        if (isPreviewContext()) {
          setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
          setIsMock(true);
        } else {
          setErrored(true);
        }
        return;
      }
      setData(result as CausalityPayload);
    } catch (err) {
      console.error('[PerformanceCausalityCard] fetch error:', err);
      if (isPreviewContext()) {
        setData(MOCK_CAUSALITY_PAYLOAD as unknown as CausalityPayload);
        setIsMock(true);
      } else {
        setErrored(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Empty state messaging (data-honest) ────────────────────────────
  const cov = data?.coverage;
  const lensAEmpty = !cov?.hasCalendar
    ? 'Connect calendar to unlock'
    : !cov.hasWearable
      ? `Need 5+ wearable days — currently ${cov.wearableDayCount}`
      : `Classified ${cov.eventTypesIdentified ?? 0} event type(s); none cleared the threshold yet.`;
  const lensBEmpty = !cov?.hasCalendar
    ? 'Connect calendar to unlock'
    : (cov.checkinCount < 7
      ? `Need 7+ check-ins — currently ${cov.checkinCount}`
      : 'No cognitive cost cleared the threshold yet.');
  const lensCEmpty = cov?.hasWearableSleep === false
    ? 'Connect Apple Health sleep tracking — no sleep records yet.'
    : !cov?.hasWearable
      ? `Need 5+ wearable days — currently ${cov?.wearableDayCount ?? 0}`
      : 'No clear sleep→next-day pattern yet.';
  const lensDEmpty = !cov?.hasCalendar
    ? 'Connect calendar to unlock'
    : 'No back-to-back heavy-day streak detected yet.';

  const totalFindings =
    (data?.lensA.length || 0) +
    (data?.lensB.length || 0) +
    (data?.lensC.length || 0) +
    (data?.lensD.length || 0);
  // Hero is allowed to render even when all lens arrays are empty,
  // as long as the engine produced a top finding.
  const hasAnyContent = !!(data?.top) || totalFindings > 0;

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Cause &amp; Effect
          </span>
          <div className="flex items-center gap-2">
            {isMock && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/40">
                Preview
              </span>
            )}
            <InsightInfoModal
              title="Cause & Effect"
              explanation="Patterns where a leader-controllable input (event type, sleep, consecutive heavy days) produces a measured shift in your physiology, cognition, or Performance Readiness Score vs your own 30-day baseline. Only patterns with at least 3 occurrences and a meaningful magnitude are shown — everything else is dropped, not softened."
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : errored ? (
          <div className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Couldn’t load cause-effect patterns. Try refreshing.</span>
          </div>
        ) : !data || !hasAnyContent ? (
          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Patterns are still forming — keep checking in.
            </p>
            {cov && (
              <p className="text-[11px] text-muted-foreground/60">
                {cov.checkinCount} check-ins · {cov.wearableDayCount} wearable days · {cov.briefCount} briefs · {cov.eventCount} events
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Hero: top finding always visible */}
            {data.top && (
              <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2 mb-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
                  Highest-impact pattern
                </div>
                <FindingRow f={data.top} />
              </div>
            )}

            {/* 4 chevron lenses, all collapsed by default */}
            <div className="space-y-1">
              <LensSection
                icon={HeartPulse}
                title="Events that cost you physiologically"
                findings={data.lensA}
                emptyMessage={lensAEmpty}
              />
              <LensSection
                icon={Brain}
                title="Events that cost you cognitively"
                findings={data.lensB}
                emptyMessage={lensBEmpty}
              />
              <LensSection
                icon={Moon}
                title="Sleep → next-day decision quality"
                findings={data.lensC}
                emptyMessage={lensCEmpty}
              />
              <LensSection
                icon={Layers}
                title="Recovery after heavy-day streaks"
                findings={data.lensD}
                emptyMessage={lensDEmpty}
              />
            </div>

            <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
              Last 30 days · n≥3 occurrences · |Δ|≥10% (or ≥0.5 tier) vs your baseline
            </p>
          </>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceCausalityCard;