/**
 * Practice Effectiveness Card v3
 *
 * Three-box swap-chart insight powered exclusively by:
 *   • content_relevance_feedback (star_rating, post_practice / post_plan)
 *   • sanctuary_events (completions, time-of-day, day-of-week)
 *   • daily_checkins (clarity / sharpness / confidence — baseline vs next)
 *   • wearable_data (HRV, RHR — next-morning lift)
 *   • user_favorites (★ booster)
 *
 * All aggregation lives server-side in the `content-feedback` edge function
 * (action: GET_PRACTICE_IMPACT). This component only renders.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { cn } from '@/lib/utils';

type Stage = 'day_1_6' | 'day_7_29' | 'day_30_plus';

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
  stage: Stage;
  windowDays: number;
  box1: { practices: Box1Practice[] };
  box2: Box2Data;
  box3: { dims: Box3Dim[] };
}

interface PracticeEffectivenessProps {
  userId?: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  day_1_6: 'Day 1–6',
  day_7_29: 'Day 7–29',
  day_30_plus: 'Day 30+',
};

const STAGE_NOTE: Record<Stage, string | null> = {
  day_1_6:
    "You're just starting. We're collecting your first signals — next-session check-ins and post-practice ratings. No patterns yet, but your baselines are being set.",
  day_7_29:
    'Early signals forming. Favourited practices and ratings are starting to show a direction. Check-ins after each session sharpen this quickly.',
  day_30_plus: null,
};

const PracticeEffectiveness = ({ userId }: PracticeEffectivenessProps) => {
  const [data, setData] = useState<ImpactPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('day_30_plus');
  const [activeBox, setActiveBox] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getAuthToken();
        const { data: res, error } = await supabase.functions.invoke('content-feedback', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: { action: 'GET_PRACTICE_IMPACT' },
        });
        if (error) throw error;
        if (cancelled) return;
        const payload = (res as any)?.data ?? null;
        setData(payload);
        if (payload?.stage) setStage(payload.stage);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPractices = data?.totalPractices ?? 0;
  const box1 = data?.box1?.practices ?? [];
  const box2 = data?.box2;
  const box3 = data?.box3?.dims ?? [];

  // Lock thresholds (UI-side; mirrors stage)
  const box1Locked = box1.length === 0 || (stage === 'day_1_6' && totalPractices < 3);
  const box2Locked = !box2 || ((box2.byWindow.morning.n + box2.byWindow.afternoon.n + box2.byWindow.evening.n) === 0);
  const box3Locked = box3.every((d) => d.n === 0);

  const top = box1[0];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            Practice effectiveness
          </span>
          <InsightInfoModal
            title="Practice Effectiveness"
            explanation="Three lenses on your practice: what works, when it works, and the cognitive + physical lift it produces. Built from your post-session check-ins, ratings, favourites and wearable signals over the last 30 days."
          />
        </div>
        <span className="text-[10px] text-muted-foreground/70">
          {totalPractices > 0 ? `Based on ${totalPractices} session${totalPractices === 1 ? '' : 's'} · 30 days` : '30 days'}
        </span>
      </div>

      {/* Stage bar */}
      <div className="flex gap-1 mb-4">
        {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={cn(
              'flex-1 py-1 rounded-full text-[10px] font-medium border border-border/60 transition-colors',
              stage === s
                ? 'bg-foreground text-background border-transparent'
                : 'bg-transparent text-muted-foreground hover:border-border'
            )}
          >
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>

      {STAGE_NOTE[stage] && (
        <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2 mb-4 leading-relaxed">
          {STAGE_NOTE[stage]}
        </div>
      )}

      {/* Three boxes */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <BoxCard
          index={1}
          active={activeBox === 1}
          onClick={() => setActiveBox(1)}
          eyebrow="Most effective practice"
          locked={box1Locked}
          lockedSub={`Complete ${Math.max(0, 3 - totalPractices)}+ session${totalPractices === 2 ? '' : 's'} to unlock`}
          val={top?.title ?? '—'}
          sub={top ? `${top.sessions} session${top.sessions === 1 ? '' : 's'} · ${top.thumbsUp}/${top.thumbsTotal || top.sessions} 👍` : ''}
          delta={top && top.clarityDelta !== 0 ? `${top.clarityDelta > 0 ? '+' : ''}${top.clarityDelta}% clarity vs baseline` : null}
          favourite={top?.isFavourite}
          pip={Math.min(totalPractices, 18)}
          pipMax={18}
          accent="hsl(var(--saffron))"
        />
        <BoxCard
          index={2}
          active={activeBox === 2}
          onClick={() => setActiveBox(2)}
          eyebrow="Best time of day"
          locked={box2Locked}
          lockedSub="Check in after sessions to unlock"
          val={box2 && !box2Locked ? capitalize(box2.best) : '—'}
          sub={box2 && !box2Locked ? `${box2.byWindow[box2.best].n} session${box2.byWindow[box2.best].n === 1 ? '' : 's'} in window` : ''}
          delta={box2 && !box2Locked ? `Avg ${box2.byWindow[box2.best].score}% post-session score` : null}
          pip={box2 ? box2.byWindow.morning.n + box2.byWindow.afternoon.n + box2.byWindow.evening.n : 0}
          pipMax={18}
          accent="hsl(var(--primary))"
        />
        <BoxCard
          index={3}
          active={activeBox === 3}
          onClick={() => setActiveBox(3)}
          eyebrow="Cognitive + physical lift"
          locked={box3Locked}
          lockedSub="Needs 3 check-ins to measure"
          val={liftHeadline(box3)}
          sub="Clarity + sharpness combined"
          delta={wearableHeadline(box3)}
          pip={Math.max(...box3.map((d) => d.n), 0)}
          pipMax={18}
          accent="hsl(var(--accent-foreground))"
        />
      </div>

      {/* Chart area */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        {activeBox === 1 && <ChartBox1 practices={box1} locked={box1Locked} totalPractices={totalPractices} />}
        {activeBox === 2 && <ChartBox2 box2={box2} locked={box2Locked} totalPractices={totalPractices} />}
        {activeBox === 3 && <ChartBox3 dims={box3} locked={box3Locked} />}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// Box card

interface BoxCardProps {
  index: 1 | 2 | 3;
  active: boolean;
  onClick: () => void;
  eyebrow: string;
  locked: boolean;
  lockedSub: string;
  val: string;
  sub: string;
  delta: string | null;
  favourite?: boolean;
  pip: number;
  pipMax: number;
  accent: string;
}

const BoxCard = ({
  active,
  onClick,
  eyebrow,
  locked,
  lockedSub,
  val,
  sub,
  delta,
  favourite,
  pip,
  pipMax,
  accent,
}: BoxCardProps) => {
  const pipFill = Math.round(Math.min(pip / Math.max(pipMax, 1), 1) * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative text-left rounded-xl border bg-card p-3.5 overflow-hidden transition-colors',
        active ? 'border-foreground/30' : 'border-border/60 hover:border-border'
      )}
    >
      <div
        className={cn(
          'text-[9px] font-medium tracking-wider uppercase mb-1.5 flex items-center gap-1 min-w-0',
          locked ? 'text-muted-foreground' : 'text-foreground/70'
        )}
      >
        <span className="line-clamp-2 break-words leading-tight">{eyebrow}</span>
        {favourite && (
          <span className="inline-flex items-center gap-0.5 text-[8px] bg-saffron/15 text-saffron px-1 py-0.5 rounded-sm">
            <Star className="h-2 w-2 fill-current" /> fav
          </span>
        )}
      </div>
      {locked ? (
        <div className="flex flex-col justify-center min-h-[60px]">
          <div className="text-2xl text-muted-foreground/40">—</div>
          <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{lockedSub}</div>
        </div>
      ) : (
        <>
          <div className="text-[14px] sm:text-[18px] md:text-[20px] font-medium text-foreground leading-tight mb-0.5 line-clamp-2 break-words">
            {val}
          </div>
          {sub && <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2 break-words">{sub}</div>}
          {delta && (
            <div className="text-[10px] font-medium mt-1.5 text-foreground/80 leading-snug line-clamp-2 break-words">
              {delta}
            </div>
          )}
        </>
      )}
      <div className="mt-2.5 h-[3px] w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pipFill}%`, background: accent, opacity: locked ? 0.4 : 0.85 }}
        />
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: accent, opacity: locked ? 0.15 : 0.35 }}
      />
    </button>
  );
};

// ──────────────────────────────────────────────────────────────
// Chart views

const ChartBox1 = ({
  practices,
  locked,
  totalPractices,
}: {
  practices: Box1Practice[];
  locked: boolean;
  totalPractices: number;
}) => {
  if (locked) {
    return (
      <EmptyState
        title="Your first signals"
        body="After each session, a check-in or rating sharpens this view."
        sessionsLogged={totalPractices}
      />
    );
  }
  const top = practices.slice(0, 5);
  const max = Math.max(...top.map((p) => p.compositeScore), 1);
  return (
    <>
      <div className="text-[12px] font-medium text-foreground mb-0.5">
        Practice effectiveness — ranked by next check-in lift
      </div>
      <div className="text-[10px] text-muted-foreground mb-3">
        Composite of clarity · sharpness · confidence from your most recent post-session check-in. Ratings = post-practice / post-plan feedback.
      </div>
      <div className="space-y-1.5">
        {top.map((p) => {
          const width = Math.round((p.compositeScore / max) * 100);
          return (
            <div key={p.contentId} className="flex items-center gap-2">
              <span className="text-[11px] text-foreground/80 w-[110px] truncate flex items-center gap-1">
                {p.isFavourite && <Star className="h-2.5 w-2.5 fill-saffron text-saffron" />}
                {p.title}
                {p.planBadge && (
                  <span className="text-[8px] bg-saffron/15 text-saffron px-1 rounded-sm ml-1">
                    plan
                  </span>
                )}
              </span>
              <div className="flex-1 bg-muted rounded h-5 overflow-hidden">
                <div
                  className="h-full rounded bg-foreground/80 flex items-center px-1.5 text-[9px] font-medium text-background whitespace-nowrap transition-all duration-500"
                  style={{ width: `${width}%` }}
                >
                  {width > 30 ? `${p.sessions} session${p.sessions === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground w-[42px] text-right tabular-nums">
                {p.thumbsTotal > 0 ? `${p.thumbsUp}/${p.thumbsTotal}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};

const ChartBox2 = ({
  box2,
  locked,
  totalPractices,
}: {
  box2?: Box2Data;
  locked: boolean;
  totalPractices: number;
}) => {
  if (locked || !box2) {
    return (
      <EmptyState
        title="When your practices land hardest"
        body="Check in after sessions across morning, afternoon and evening to surface your sharpest window."
        sessionsLogged={totalPractices}
      />
    );
  }
  const windows: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening'];
  const dowLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const dowMax = Math.max(...box2.byDayOfWeek.map((d) => d.score), 1);
  return (
    <>
      <div className="text-[12px] font-medium text-foreground mb-0.5">
        When your practices land hardest
      </div>
      <div className="text-[10px] text-muted-foreground mb-3">
        Average post-session check-in score by time window.
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {windows.map((w) => {
          const isBest = w === box2.best && box2.byWindow[w].n > 0;
          return (
            <div
              key={w}
              className={cn(
                'rounded-lg p-2.5 text-center border',
                isBest ? 'bg-saffron/10 border-transparent' : 'border-border/60'
              )}
            >
              <div className={cn('text-[10px] font-medium mb-0.5', isBest ? 'text-saffron' : 'text-muted-foreground')}>
                {capitalize(w)}
              </div>
              <div className="text-[18px] font-medium text-foreground tabular-nums">
                {box2.byWindow[w].n > 0 ? `${box2.byWindow[w].score}%` : '—'}
              </div>
              <div className="text-[9px] text-muted-foreground/80 mt-0.5">
                {box2.byWindow[w].n} session{box2.byWindow[w].n === 1 ? '' : 's'}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3.5">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
          By day of week
        </div>
        <div className="flex gap-1">
          {box2.byDayOfWeek.map((d, i) => {
            const isBest = d.score === dowMax && d.n > 0;
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-center transition-colors',
                  isBest ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                )}
              >
                <div className="text-[9px]">{dowLabels[i]}</div>
                <div className="text-[10px] font-medium tabular-nums mt-0.5">
                  {d.n > 0 ? d.score : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

const ChartBox3 = ({ dims, locked }: { dims: Box3Dim[]; locked: boolean }) => {
  if (locked) {
    return (
      <EmptyState
        title="Before vs after — cognitive and physical lift"
        body="We pair your session-day baseline with your next check-in to show the lift. Connect a wearable to add HRV and RHR signals."
      />
    );
  }
  return (
    <>
      <div className="text-[12px] font-medium text-foreground mb-0.5">
        Before vs after — cognitive and physical lift
      </div>
      <div className="text-[10px] text-muted-foreground mb-3">
        Same-day baseline vs next check-in post-practice. RHR lower = better.
      </div>
      <div className="flex gap-3 mb-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-[3px] rounded bg-muted-foreground/40" /> Before
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-[3px] rounded bg-foreground" /> After
        </span>
      </div>
      <div className="space-y-2.5">
        {dims.map((d) => {
          const liftPositive = d.inverse ? d.lift > 0 : d.lift > 0;
          const hasData = d.n > 0;
          const beforeW = clampPct(d.before);
          const afterW = clampPct(d.after);
          return (
            <div key={d.label}>
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-[11px] text-foreground/80">{d.label}</span>
                <span
                  className={cn(
                    'text-[10px] font-medium tabular-nums',
                    !hasData
                      ? 'text-muted-foreground/60'
                      : liftPositive
                      ? 'text-saffron'
                      : 'text-muted-foreground'
                  )}
                >
                  {hasData ? `${d.lift > 0 ? '+' : ''}${d.lift}%` : '— no data'}
                  {d.inverse && hasData ? ' (lower = better)' : ''}
                </span>
              </div>
              <div className="bg-muted rounded h-3 overflow-hidden mb-1">
                <div className="h-full rounded bg-muted-foreground/40" style={{ width: `${beforeW}%` }} />
              </div>
              <div className="bg-muted rounded h-3 overflow-hidden">
                <div
                  className="h-full rounded bg-foreground flex items-center px-1.5"
                  style={{ width: `${afterW}%` }}
                >
                  {afterW > 25 && hasData && (
                    <span className="text-[9px] font-medium text-background tabular-nums">
                      {Math.round(d.after)}
                      {d.label.startsWith('HRV') || d.label.startsWith('RHR') ? '' : '%'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// Helpers

const EmptyState = ({
  title,
  body,
  sessionsLogged,
}: {
  title: string;
  body: string;
  sessionsLogged?: number;
}) => (
  <div>
    <div className="text-[12px] font-medium text-foreground mb-0.5">{title}</div>
    <div className="text-[10px] text-muted-foreground mb-3">{body}</div>
    {typeof sessionsLogged === 'number' && (
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted/50 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">Sessions logged</div>
          <div className="text-[18px] font-medium text-foreground tabular-nums">{sessionsLogged}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {sessionsLogged < 3 ? `Need ${3 - sessionsLogged} more to unlock pattern` : 'Pattern forming'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">Tip</div>
          <div className="text-[11px] text-foreground/80 leading-snug">
            Check in <strong>right after</strong> a session — sharpest signal.
          </div>
        </div>
      </div>
    )}
  </div>
);

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}
function liftHeadline(dims: Box3Dim[]): string {
  const cog = dims.filter((d) => ['Clarity', 'Sharpness', 'Confidence'].includes(d.label) && d.n > 0);
  if (cog.length === 0) return '—';
  const avg = Math.round(cog.reduce((a, b) => a + b.lift, 0) / cog.length);
  return `${avg > 0 ? '+' : ''}${avg}%`;
}
function wearableHeadline(dims: Box3Dim[]): string | null {
  const hrv = dims.find((d) => d.label.startsWith('HRV'));
  const rhr = dims.find((d) => d.label.startsWith('RHR'));
  const parts: string[] = [];
  if (hrv && hrv.n > 0) parts.push(`HRV ${hrv.lift > 0 ? '+' : ''}${hrv.lift}%`);
  if (rhr && rhr.n > 0) parts.push(`RHR ${rhr.lift > 0 ? '−' : '+'}${Math.abs(rhr.lift)}%`);
  return parts.length ? parts.join(' · ') : null;
}

export default PracticeEffectiveness;
