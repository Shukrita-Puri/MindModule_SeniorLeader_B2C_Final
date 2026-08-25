/**
 * Practice Effectiveness Card v6 (UI only)
 *
 * "What Restores Your Performance". Practices are tiered into Confirmed,
 * Building signal and Tried, each rendered with the same two-line row format:
 * name + chips, then up to three signal slots. The GET_PRACTICE_IMPACT payload
 * shape is unchanged.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Star } from 'lucide-react';
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
  postEventRating?: number | null;
  postEventRatingN?: number;
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

/** Unresolved content IDs surface as these placeholder titles — never show them. */
function isOrphanRow(practice: Box1Practice): boolean {
  const category = (practice.category || '').toLowerCase();
  if (category !== 'unknown') return false;
  return practice.title === 'Practice' || practice.title === 'Daily plan';
}

function wearableN(practice: Box1Practice): number {
  return practice.wearableSignal?.n ?? 0;
}

function tierOf(practice: Box1Practice): 1 | 2 | 3 | null {
  if (practice.sessions < 1) return null;
  if (practice.thumbsTotal >= 3 || wearableN(practice) >= 3) return 1;
  if (practice.thumbsTotal >= 1 || wearableN(practice) >= 1) return 2;
  return 3;
}

const PracticeEffectiveness = ({ userId }: PracticeEffectivenessProps) => {
  const [data, setData] = useState<ImpactPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBuilding, setShowBuilding] = useState(false);
  const [triedOpen, setTriedOpen] = useState(false);

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

  const { tier1, tier2, tier3 } = useMemo(() => {
    const eligible = practices.filter((practice) => !isOrphanRow(practice));
    const t1 = eligible.filter((p) => tierOf(p) === 1);
    const t2 = eligible.filter((p) => tierOf(p) === 2);
    const t3 = eligible.filter((p) => tierOf(p) === 3);
    t1.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
    t2.sort((a, b) => b.thumbsTotal + wearableN(b) - (a.thumbsTotal + wearableN(a)));
    t3.sort((a, b) => b.sessions - a.sessions);
    return { tier1: t1, tier2: t2, tier3: t3 };
  }, [practices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary =
    tier1.length > 0
      ? `${tier1[0].title} is your most consistent restorer.`
      : tier2.length > 0
        ? 'Your practice patterns are beginning to form.'
        : 'Complete a practice to see what restores your performance.';

  const isEmpty = tier1.length === 0 && tier2.length === 0 && tier3.length === 0;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 min-w-0 mb-3">
        <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
          What Restores Your Performance
        </span>
        <InsightInfoModal
          title="What Restores Your Performance"
          explanation="Which practices are measurably helping you recover or lift state, using your own rating plus the wearable signal that fits each practice type."
        />
        <InsightShareSlot />
      </div>

      <div className="text-sm font-medium text-foreground leading-snug mb-3">
        {isEmpty
          ? 'Complete a practice session to see what restores your performance.'
          : summary}
      </div>

      {isEmpty && (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          Complete a practice session to see what restores your performance.
        </div>
      )}

      {tier1.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Your most effective practices
          </div>
          <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20">
            {tier1.map((practice) => (
              <FindingRow key={`t1-${practice.contentId}`} practice={practice} />
            ))}
          </div>
        </>
      )}

      {section2.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-4 mb-2">
            Before your hardest days
          </div>
          <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20 px-3 py-3">
            {section2.map((entry) => (
              <HardestDayRow key={entry.eventType} entry={entry} />
            ))}
          </div>
        </>
      )}

      {tier2.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-4 mb-2">
            Building signal
          </div>
          <div className="divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20">
            {tier2.map((practice) => (
              <div key={`t2-${practice.contentId}`} className="opacity-70">
                <FindingRow practice={practice} />
              </div>
            ))}
          </div>
        </>
      )}

      {tier3.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setTriedOpen((open) => !open)}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <ChevronRight
              className={cn('h-3 w-3 transition-transform', triedOpen && 'rotate-90')}
            />
            {tier3.length} practice{tier3.length === 1 ? '' : 's'} tried — tap to see
          </button>
          {triedOpen && (
            <div className="mt-2 divide-y divide-border/30 rounded-md overflow-hidden bg-muted/20 opacity-50">
              {tier3.map((practice) => (
                <FindingRow key={`t3-${practice.contentId}`} practice={practice} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function categoryChipClass(category: string) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('pause')) return 'bg-blue-100 text-blue-800';
  if (cat.includes('flow')) return 'bg-emerald-100 text-emerald-800';
  if (cat.includes('energise') || cat.includes('energize')) return 'bg-amber-100 text-amber-800';
  return 'bg-muted text-muted-foreground';
}

function formatWearableSignal(signal: WearableSignal): { text: string; positive: boolean } | null {
  const pct = signal.primarySignalPct;
  if (pct == null || signal.n < 1) return null;
  const abs = Math.abs(pct).toFixed(0);
  // A "positive impact" reads as a rise for HRV / activation signals and as a
  // drop for composing signals, so the sign follows the measured direction.
  const rising = signal.primarySignalIsPositive;
  const sign = rising ? (pct >= 0 ? '+' : '−') : pct >= 0 ? '−' : '+';
  const positive = pct > 0;
  return { text: `${sign}${abs}% ${signal.primarySignalLabel}`, positive };
}

function FindingRow({ practice }: { practice: Box1Practice }) {
  const signal = practice.wearableSignal;
  const wearable = signal ? formatWearableSignal(signal) : null;
  const wearableEarly = (signal?.n ?? 0) === 1;
  const eventChip = practice.dominantEventCategory
    ? practice.dominantEventCategory.length > 22
      ? `${practice.dominantEventCategory.slice(0, 22)}…`
      : practice.dominantEventCategory
    : null;

  const slots: React.ReactNode[] = [];

  if (practice.thumbsTotal >= 1) {
    slots.push(
      <span key="thumbs" className="text-xs tabular-nums text-foreground/80">
        👍 {practice.thumbsUp}/{practice.thumbsTotal}
      </span>,
    );
  }

  if (wearable) {
    slots.push(
      <span
        key="wearable"
        className={cn(
          'text-xs tabular-nums',
          wearableEarly
            ? 'text-muted-foreground/60'
            : wearable.positive
              ? 'text-emerald-700'
              : 'text-muted-foreground',
        )}
      >
        {wearable.text}
      </span>,
    );
  }

  const postEventN = practice.postEventRatingN ?? 0;
  if (practice.postEventRating != null && postEventN >= 1) {
    slots.push(
      <span key="post-event" className="text-xs tabular-nums text-foreground/80">
        👍 {practice.postEventRating}/{postEventN} events
      </span>,
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{practice.title}</span>
        {practice.isFavourite && <Star className="h-3 w-3 flex-shrink-0 fill-saffron text-saffron" />}
        <span className={cn('text-[9px] rounded-full px-1.5 py-0.5', categoryChipClass(practice.category))}>
          {practice.category}
        </span>
        {eventChip && (
          <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-muted/60 text-muted-foreground">
            {eventChip}
          </span>
        )}
      </div>
      {slots.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {slots.map((slot, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-xs text-muted-foreground">·</span>}
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
  if (entry.hrDeltaPct != null) {
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
