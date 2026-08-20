/**
 * Practice Effectiveness Card v4
 *
 * Flattened "What Restores Your Performance" surface. The server still owns
 * aggregation; this component only turns the existing impact payload into one
 * summary line plus finding rows.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import InsightShareSlot from '@/components/insights/InsightShareSlot';
import { cn } from '@/lib/utils';

type Stage = 'early' | 'building' | 'deepening';
type LegacyStage = 'day_1_6' | 'day_7_29' | 'day_30_plus';

interface Box1Practice {
  contentId: string;
  title: string;
  category: string;
  sessions: number;
  thumbsUp: number;
  thumbsTotal: number;
  compositeScore: number;
  clarityDelta: number;
  isFavourite: boolean;
  planBadge: string | null;
}

interface Box2Data {
  byWindow: Record<'morning' | 'afternoon' | 'evening', { score: number; n: number }>;
  byDayOfWeek: Array<{ dow: number; score: number; n: number }>;
  best: 'morning' | 'afternoon' | 'evening';
}

interface Box3Dim {
  label: string;
  before: number;
  after: number;
  lift: number;
  n: number;
  inverse?: boolean;
}

interface ImpactPayload {
  totalPractices: number;
  stage: Stage | LegacyStage;
  windowDays: number;
  box1: { practices: Box1Practice[] };
  box2: Box2Data;
  box3: { dims: Box3Dim[] };
}

interface PracticeEffectivenessProps {
  userId?: string;
}

const STATUS_LABEL: Record<Stage, string> = {
  early: 'Baseline',
  building: 'Building',
  deepening: 'Deepening',
};

function normalizeStage(stage: Stage | LegacyStage | null | undefined): Stage {
  switch (stage) {
    case 'early':
    case 'building':
    case 'deepening':
      return stage;
    case 'day_7_29':
      return 'building';
    case 'day_30_plus':
      return 'deepening';
    case 'day_1_6':
    default:
      return 'early';
  }
}

const PracticeEffectiveness = ({ userId }: PracticeEffectivenessProps) => {
  const [data, setData] = useState<ImpactPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getAuthToken();
        const { data: res, error } = await supabase.functions.invoke('content-feedback', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: { action: 'GET_PRACTICE_IMPACT', lookbackWindow: 'all_time' },
        });
        if (error) throw error;
        if (!cancelled) setData((res as any)?.data ?? null);
      } catch (e) {
        console.error('[PracticeEffectiveness] fetch failed:', e);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const practices = data?.box1?.practices ?? [];
  const totalPractices = data?.totalPractices ?? 0;
  const bestWindow = data?.box2?.best;
  const stage = normalizeStage(data?.stage);
  const measurableShiftRows = useMemo(
    () => (data?.box3?.dims ?? []).filter((dim) => dim.n >= 2),
    [data?.box3?.dims],
  );

  const planRows = useMemo(() => practices.filter((practice) => !!practice.planBadge), [practices]);
  const standaloneRows = useMemo(() => practices.filter((practice) => !practice.planBadge), [practices]);
  const confirmedPractice = practices.find((practice) => practice.sessions >= 3);
  const emergingPractice = practices[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            What Restores Your Performance
          </span>
          <InsightInfoModal
            title="What Restores Your Performance"
            explanation="Which practices are measurably helping you recover or lift state, using one evidence source per row and sample counts for confidence."
          />
          <InsightShareSlot />
        </div>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
          {STATUS_LABEL[stage]}
        </span>
      </div>

      <div className="text-sm font-medium text-foreground leading-snug mb-3">
        {confirmedPractice
          ? `Most effective: ${confirmedPractice.title}${bestWindow ? ` · usually ${bestWindowLabel(bestWindow)}` : ''}`
          : emergingPractice && emergingPractice.sessions > 0
            ? `Building signal: ${emergingPractice.title} — ${3 - emergingPractice.sessions} more session${3 - emergingPractice.sessions === 1 ? '' : 's'} to confirm`
          : 'Log practices to reveal what restores your performance'}
      </div>

      <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20">
        {planRows.map((practice) => (
          <FindingRow
            key={`plan-${practice.contentId}`}
            title={practice.planBadge || 'Daily Plan'}
            subtitle={`Plan practice: ${practice.title}`}
            practice={practice}
            source="self-report"
          />
        ))}

        {standaloneRows.map((practice) => (
          <FindingRow
            key={practice.contentId}
            title={practice.title}
            subtitle={practice.category}
            practice={practice}
            source="self-report"
          />
        ))}

        {practices.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            Complete 3 practice sessions to see the first restoring signal.
          </div>
        )}
      </div>

      {measurableShiftRows.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            What&apos;s measurably shifting
          </div>
          <div className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden bg-card/40">
            {measurableShiftRows.map((dim) => (
              <PhysiologyRow key={dim.label} dim={dim} />
            ))}
          </div>
        </div>
      )}

      {totalPractices > 0 && totalPractices < 3 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Practice history — Log {3 - totalPractices} more session{3 - totalPractices === 1 ? '' : 's'} to see its effect
        </p>
      )}
    </div>
  );
};

function FindingRow({
  title,
  subtitle,
  practice,
  source,
}: {
  title: string;
  subtitle: string;
  practice: Box1Practice;
  source: 'self-report' | 'physiology';
}) {
  const sessionsNeeded = Math.max(0, 3 - practice.sessions);
  const locked = practice.sessions < 3;
  const confidence = practice.sessions >= 5 ? 'strong' : 'emerging';
  const evidence = source === 'physiology'
    ? 'HR signal forming'
    : `Outcome ${practice.clarityDelta >= 0 ? '+' : ''}${practice.clarityDelta}% vs baseline`;

  if (locked) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground">
        {title} — Log {sessionsNeeded} more session{sessionsNeeded === 1 ? '' : 's'} to see its effect
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{title}</span>
            {practice.isFavourite && <Star className="h-3 w-3 flex-shrink-0 fill-saffron text-saffron" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        </div>
        <span
          className={cn(
            'text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap',
            confidence === 'strong'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground',
          )}
        >
          n={practice.sessions} {confidence}
        </span>
      </div>
      <div className="mt-2 text-xs text-foreground/85 tabular-nums">
        {evidence}
      </div>
    </div>
  );
}

function bestWindowLabel(window: 'morning' | 'afternoon' | 'evening') {
  if (window === 'morning') return 'AM';
  if (window === 'afternoon') return 'afternoon';
  return 'evening';
}

function PhysiologyRow({ dim }: { dim: Box3Dim }) {
  const confidence = dim.n >= 5 ? 'strong' : 'emerging';
  const liftPositive = dim.inverse ? dim.lift < 0 : dim.lift > 0;
  const liftLabel = `${dim.lift > 0 ? '+' : ''}${dim.lift.toFixed(0)}%`;

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{dim.label}</div>
          <div className="text-[11px] text-muted-foreground">
            Before {formatPhysiologyValue(dim.before)} to after {formatPhysiologyValue(dim.after)}
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap',
            confidence === 'strong'
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground',
          )}
        >
          n={dim.n} {confidence}
        </span>
      </div>
      <div
        className={cn(
          'mt-2 text-xs font-medium tabular-nums',
          liftPositive ? 'text-emerald-700' : 'text-amber-700',
        )}
      >
        {liftPositive ? 'Improving' : 'Monitoring'} {liftLabel} vs pre-practice baseline
      </div>
    </div>
  );
}

function formatPhysiologyValue(value: number) {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default PracticeEffectiveness;
