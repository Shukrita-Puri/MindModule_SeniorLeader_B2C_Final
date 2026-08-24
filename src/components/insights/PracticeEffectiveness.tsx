/**
 * Practice Effectiveness Card v5
 *
 * "What Restores Your Performance". Every practice with at least one session
 * renders; each row carries the self-declared signal plus a category-aware
 * wearable signal computed server-side. A second section shows what was used
 * before the user's hardest day types.
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

interface WearableSignal {
  primarySignalPct: number | null;
  primarySignalLabel: string;
  primarySignalIsPositive: boolean;
  secondarySignalPct: number | null;
  secondarySignalLabel: string;
  n: number;
}

interface Box1Practice {
  contentId: string;
  title: string;
  category: string;
  sessions: number;
  thumbsUp: number;
  thumbsTotal: number;
  thumbsRate: number | null;
  compositeScore: number;
  isFavourite: boolean;
  planBadge: string | null;
  wearableSignal: WearableSignal | null;
  dominantEventCategory: string | null;
}

interface Section2Entry {
  eventType: string;
  practicesUsed: string[];
  hrDeltaPct: number | null;
  hrDeltaN: number;
  postEventRating: null;
  postEventRatingN: number;
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
  section2: Section2Entry[];
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
  const section2 = data?.section2 ?? [];
  const stage = normalizeStage(data?.stage);

  const planRows = useMemo(() => practices.filter((practice) => !!practice.planBadge), [practices]);
  const standaloneRows = useMemo(() => practices.filter((practice) => !practice.planBadge), [practices]);
  const confirmedPractice = practices.find((practice) => practice.sessions >= 3);
  const emergingPractice = practices.find((practice) => practice.sessions >= 1);

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
            explanation="Which practices are measurably helping you recover or lift state, using your own rating plus the wearable signal that fits each practice type, with sample counts for confidence."
          />
          <InsightShareSlot />
        </div>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
          {STATUS_LABEL[stage]}
        </span>
      </div>

      <div className="text-sm font-medium text-foreground leading-snug mb-3">
        {confirmedPractice
          ? `Most effective: ${confirmedPractice.title}`
          : emergingPractice
            ? `Building signal: ${emergingPractice.title}`
            : 'Complete a practice session to see what restores your performance.'}
      </div>

      <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20">
        {planRows.map((practice) => (
          <FindingRow
            key={`plan-${practice.contentId}`}
            title={practice.planBadge || 'Daily Plan'}
            practice={practice}
          />
        ))}

        {standaloneRows.map((practice) => (
          <FindingRow key={practice.contentId} title={practice.title} practice={practice} />
        ))}

        {practices.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            Complete a practice session to see what restores your performance.
          </div>
        )}
      </div>

      {section2.length > 0 && (
        <>
          <div className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mt-4 mb-2">
            Before Your Hardest Days
          </div>
          <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20 px-3 py-3">
            {section2.map((entry) => (
              <HardestDayRow key={entry.eventType} entry={entry} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

function categoryChipClass(category: string) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('pause')) return 'bg-blue-100 text-blue-700';
  if (cat.includes('flow')) return 'bg-emerald-100 text-emerald-700';
  if (cat.includes('energise') || cat.includes('energize')) return 'bg-amber-100 text-amber-700';
  return 'bg-muted text-muted-foreground';
}

function formatWearableSignal(signal: WearableSignal): { text: string; positive: boolean } | null {
  const pct = signal.primarySignalPct;
  if (pct == null || signal.n < 2) return null;
  const abs = Math.abs(pct).toFixed(0);
  // A "positive impact" reads as a rise for HRV / activation signals and as a
  // drop for composing signals, so the sign follows the measured direction.
  const rising = signal.primarySignalIsPositive;
  const sign = rising ? (pct >= 0 ? '+' : '−') : pct >= 0 ? '−' : '+';
  const positive = rising ? pct > 0 : pct > 0;
  return { text: `${sign}${abs}% ${signal.primarySignalLabel}`, positive };
}

function FindingRow({ title, practice }: { title: string; practice: Box1Practice }) {
  const wearable = practice.wearableSignal ? formatWearableSignal(practice.wearableSignal) : null;
  const eventChip = practice.dominantEventCategory
    ? practice.dominantEventCategory.length > 20
      ? `${practice.dominantEventCategory.slice(0, 20)}…`
      : practice.dominantEventCategory
    : null;

  const slots: React.ReactNode[] = [];
  if (practice.thumbsTotal >= 1) {
    slots.push(
      <span key="thumbs">
        👍 {practice.thumbsUp}/{practice.thumbsTotal}
      </span>,
    );
  }
  if (wearable) {
    slots.push(
      <span key="wearable" className={wearable.positive ? 'text-emerald-700' : 'text-muted-foreground'}>
        {wearable.text}
      </span>,
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
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[9px] rounded-full px-1.5 py-0.5', categoryChipClass(practice.category))}>
              {practice.category}
            </span>
            {eventChip && (
              <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-muted/60 text-muted-foreground">
                {eventChip}
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap bg-muted text-muted-foreground">
          n={practice.sessions}
        </span>
      </div>
      {slots.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs tabular-nums text-foreground/80">
          {slots.map((slot, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">·</span>}
              {slot}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function HardestDayRow({ entry }: { entry: Section2Entry }) {
  let hrText = 'HR during event: — no wearable data yet';
  let hrClass = 'text-muted-foreground';
  if (entry.hrDeltaPct != null && entry.hrDeltaN >= 1) {
    if (entry.hrDeltaN < 2) {
      hrText = 'HR during event: — need more data';
    } else if (Math.abs(entry.hrDeltaPct) < 3) {
      hrText = 'HR during event: similar to your average';
    } else if (entry.hrDeltaPct > 0) {
      hrText = `HR during event: −${Math.abs(entry.hrDeltaPct).toFixed(0)}% vs your average`;
      hrClass = 'text-emerald-700';
    } else {
      hrText = `HR during event: +${Math.abs(entry.hrDeltaPct).toFixed(0)}% vs your average`;
    }
  }

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="text-sm font-medium text-foreground">{entry.eventType}</div>
      {entry.practicesUsed.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Practices: {entry.practicesUsed.join(' · ')}
        </div>
      )}
      <div className={cn('text-xs tabular-nums', hrClass)}>{hrText}</div>
    </div>
  );
}

export default PracticeEffectiveness;
