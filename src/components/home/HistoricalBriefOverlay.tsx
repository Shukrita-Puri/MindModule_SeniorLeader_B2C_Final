/**
 * HistoricalBriefOverlay
 * Frosted-glass overlay rendered above /executive-home that displays a past
 * Performance Readiness Brief snapshot. Visual layout mirrors the live brief
 * card. Read-only (no feedback, no signal-pill expansion, no CTAs).
 */

import { X, Brain, BatteryMedium, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useBriefSnapshot,
  type BriefSnapshotRecord,
  type WearableSnapshot,
  type CheckinSnapshot,
} from '@/hooks/useBriefSnapshot';
import {
  buildExecutivePills,
  type ExecutivePill,
  type PillState,
} from '@/components/home/DecisionReadinessBrief';

interface Props {
  briefId: string;
  onClose: () => void;
}

const TIER_COLOR: Record<string, string> = {
  depleted: 'text-[hsl(var(--tier-low))]',
  managing: 'text-[hsl(var(--tier-moderate))]',
  strong:   'text-[hsl(var(--tier-strong))]',
  peak:     'text-[hsl(var(--tier-strong))]',
};

const TIER_LABEL: Record<string, string> = {
  depleted: 'LOW RESERVE',
  managing: 'MODERATE',
  strong: 'STRONG',
  peak: 'PEAK',
};

// ─── Pill rendering tokens (match live brief visual language) ───
const PILL_BODY = 'bg-white/85';
const PILL_SHADOW = 'shadow-[0_2px_8px_rgba(0,0,0,0.06)]';
const PILL_HEADLINE = 'text-muted-foreground';
const PILL_SIGNAL = 'text-foreground';

const PILL_COLORS: Record<PillState, { icon: string; badge: string; badgeRing: string }> = {
  green:   { icon: 'text-emerald-600', badge: 'bg-emerald-100/80', badgeRing: 'ring-1 ring-emerald-200/50' },
  amber:   { icon: 'text-amber-600',   badge: 'bg-amber-100/80',   badgeRing: 'ring-1 ring-amber-200/50' },
  red:     { icon: 'text-red-600',     badge: 'bg-red-100/80',     badgeRing: 'ring-1 ring-red-200/50' },
  neutral: { icon: 'text-muted-foreground', badge: 'bg-muted/60',  badgeRing: 'ring-1 ring-border/40' },
};

/**
 * Adapt a stored brief snapshot back into the `outerBrief`-shaped object that
 * `buildExecutivePills` expects. Keeps the live and historical pill renders
 * driven by the same logic — single source of truth.
 */
function snapshotToOuterBriefShape(
  wearable: WearableSnapshot | null,
  checkin: CheckinSnapshot | null,
): Record<string, unknown> {
  const w = wearable ?? ({} as Partial<WearableSnapshot>);
  const c = checkin ?? ({} as Partial<CheckinSnapshot>);
  return {
    checkInOutcome: c.checkInOutcome ?? null,
    clarityLevel: c.clarityLevel ?? null,
    confidenceLevel: c.confidenceLevel ?? null,
    mentalSharpnessLevel: c.mentalSharpnessLevel ?? null,
    consecutiveLowConfidence: c.consecutiveLowConfidence ?? 0,
    consecutiveLowClarity: c.consecutiveLowClarity ?? 0,
    hrvValue: w.hrv ?? null,
    hrvDeviation: w.hrvDeviation ?? null,
    hrvBaseline: w.hrvBaseline ?? null,
    rhrValue: w.rhr ?? null,
    rhrDeviation: w.rhrDeviation ?? null,
    rhrBaseline: w.rhrBaseline ?? null,
    hrValue: w.hr ?? null,
    hrDeviation: w.hrDeviation ?? null,
    hrBaseline: w.hrBaseline ?? null,
    sleepDuration: w.sleepDuration ?? null,
    sleepScore: w.sleepScore ?? null,
    sleepDeviation: w.sleepDeviation ?? null,
    sleepBaseline: w.sleepBaseline ?? null,
    wearableTrend7d: w.wearableTrend7d ?? null,
    scoreTrajectory7d: w.scoreTrajectory7d ?? null,
    wearableStatus: { isConnected: !!w.wearableConnected },
  };
}

const PILL_ICON: Record<ExecutivePill['id'], typeof Brain> = {
  cognitive: Brain,
  physiological: BatteryMedium,
  emotional: ShieldCheck,
};

function ReadOnlyPillCapsule({ pill }: { pill: ExecutivePill }) {
  const c = PILL_COLORS[pill.state];
  const Icon = PILL_ICON[pill.id];
  return (
    <div className="flex flex-col w-full">
      <div className={cn('flex items-center gap-3 w-full pl-2 pr-3 py-2 rounded-full rounded-b-none', PILL_BODY, PILL_SHADOW)}>
        <span className={cn('shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full', c.badge, c.badgeRing)}>
          <Icon className={cn('w-[18px] h-[18px]', c.icon)} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col items-start leading-tight">
          <span className={cn('text-[10px] uppercase tracking-[0.12em] font-body', PILL_HEADLINE)}>{pill.headline}</span>
          <span className={cn('text-sm font-semibold tracking-wide uppercase', PILL_SIGNAL)}>{pill.signalWord}</span>
        </div>
      </div>
      <div className="rounded-b-2xl backdrop-blur-md bg-white/55 px-4 py-3">
        <div className="space-y-1">
          {pill.topLines.length > 0 ? (
            pill.topLines.map((line, i) => (
              <div key={`t-${i}`} className="flex flex-col">
                <span className="text-sm font-medium text-foreground/85 font-body">{line.text}</span>
                {line.qualifier && (
                  <span className="text-xs text-muted-foreground/65 font-body italic">{line.qualifier}</span>
                )}
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground/55 font-body italic">
              {pill.topEmptyText || 'No wearable reading'}
            </span>
          )}
        </div>
        <div className="my-2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="space-y-1">
          {pill.bottomLines.length > 0 ? (
            pill.bottomLines.map((line, i) => (
              <div key={`b-${i}`} className="flex flex-col">
                <span className="text-sm font-medium text-foreground/85 font-body">{line.text}</span>
                {line.qualifier && (
                  <span className="text-xs text-muted-foreground/65 font-body italic">{line.qualifier}</span>
                )}
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground/55 font-body italic">
              {pill.bottomEmptyText || 'No self-declared reading'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "wearable evidence" footnote rendered under the pills (e.g.
 * `HRV 18.1ms · RHR 64bpm · Sleep 7h12m`). Falls back gracefully when a
 * historical snapshot is missing parts.
 */
function WearableEvidenceLine({ wearable }: { wearable: WearableSnapshot | null }) {
  if (!wearable) return null;
  const parts: string[] = [];
  if (wearable.hrv != null) parts.push(`HRV ${wearable.hrv}ms`);
  if (wearable.rhr != null) parts.push(`RHR ${wearable.rhr}bpm`);
  if (wearable.hr != null) parts.push(`HR ${wearable.hr}bpm`);
  if (wearable.sleepDuration != null) {
    const h = Math.floor(wearable.sleepDuration / 60);
    const m = wearable.sleepDuration % 60;
    parts.push(`Sleep ${h}h${m.toString().padStart(2, '0')}m`);
  } else if (wearable.sleepScore != null) {
    parts.push(`Sleep score ${wearable.sleepScore}`);
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-muted-foreground/55 font-body">
      Evidence · {parts.join(' · ')}
    </p>
  );
}

const titleCaseWindow = (w: string | null | undefined): string => {
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

const formatLocalDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
};

// Light markdown-style bold rendering (matches the live brief)
const renderBody = (text: string) => {
  const normalized = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  const parts = normalized.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  );
};

const safeText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => safeText(v)).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['title', 'label', 'status', 'summary', 'displayText', 'valueText', 'description', 'text', 'name']) {
      const candidate = safeText(obj[key]);
      if (candidate) return candidate;
    }
  }
  return '';
};

const collectBriefBeats = (brief: any): Array<{ label: string; text: string }> => {
  const beats: Array<{ label: string; text: string }> = [];
  const push = (label: string, value: unknown) => {
    const text = safeText(value);
    if (text) beats.push({ label, text });
  };
  const raw = brief?.briefBeats ?? brief?.beats ?? brief?.sections ?? null;
  if (Array.isArray(raw)) {
    for (const beat of raw) {
      if (!beat) continue;
      if (typeof beat === 'string') {
        push('Brief beat', beat);
      } else if (typeof beat === 'object') {
        const b = beat as Record<string, unknown>;
        push(safeText(b.label || b.title || b.name || b.type) || `Beat ${beats.length + 1}`, b.text ?? b.value ?? b.content ?? b.summary ?? b.description ?? b.body ?? b.detail);
      }
    }
  } else if (raw && typeof raw === 'object') {
    const b = raw as Record<string, unknown>;
    push('Signal read', b.signalRead ?? b.signal ?? b.read ?? b.signal_read);
    push('Judgment', b.judgment ?? b.judgement ?? b.reading ?? b.signalJudgment ?? b.signal_judgment);
    push('Work directive', b.workDirective ?? b.work_directive ?? b.directive ?? b.work);
    push('Self-regulation directive', b.selfRegulationDirective ?? b.regulationDirective ?? b.self_regulation_directive ?? b.regulation_directive);
  }
  return beats.slice(0, 4);
};

const HistoricalBriefOverlay = ({ briefId, onClose }: Props) => {
  const { data: brief, isLoading, isError } = useBriefSnapshot(briefId);

  const tier = (brief?.tier || '').toLowerCase();
  const tierColor = TIER_COLOR[tier] || 'text-muted-foreground';
  const tierLabel = TIER_LABEL[tier] || (brief?.tier ? brief.tier.toUpperCase() : '');

  return (
    <div
      className="fixed inset-0 z-40 bg-background/40 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Past Performance Readiness Brief"
    >
      {/* Close button — top right */}
      <button
        onClick={onClose}
        aria-label="Close historical brief"
        className="fixed z-50 w-11 h-11 md:w-10 md:h-10 rounded-full bg-taupe hover:bg-taupe/90 border border-taupe/60 flex items-center justify-center text-white transition-colors shadow-sm touch-manipulation"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
        }}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="min-h-full flex items-start justify-center px-4 pb-12 pt-[calc(env(safe-area-inset-top,0px)+5rem)] md:pt-[calc(env(safe-area-inset-top,0px)+6rem)]">
        <div className="w-full max-w-lg">
          <div className="rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 border-l-2 border-l-taupe/40">
            {isLoading && (
              <div className="py-8 text-center text-sm text-muted-foreground/70">
                Loading past brief…
              </div>
            )}

            {isError && (
              <div className="py-8 text-center text-sm text-muted-foreground/70">
                Unable to load this brief.
              </div>
            )}

            {!isLoading && !isError && !brief && (
              <div className="py-8 text-center text-sm text-muted-foreground/70">
                Brief not found.
              </div>
            )}

            {brief && (
              <>
                {/* 1. EYEBROW — clearly marked as Past */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
                    Performance Readiness Brief · <span className="text-foreground/60">Past</span>
                  </span>
                  <span className="text-xs text-muted-foreground/50 font-body whitespace-nowrap">
                    {titleCaseWindow(brief.time_window)} · {formatLocalDate(brief.local_date)}
                  </span>
                </div>

                {/* 2. SCORE */}
                <div className="flex items-baseline gap-2 mt-3">
                  {brief.score != null ? (
                    <>
                      <span className="text-[40px] font-medium leading-none text-foreground">
                        {brief.score}
                      </span>
                      <span className="text-[16px] text-muted-foreground/40">/100</span>
                      {tierLabel && (
                        <span className={cn('text-xs uppercase tracking-wider font-medium ml-1', tierColor)}>
                          {tierLabel}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-[40px] font-medium leading-none text-muted-foreground/30">--</span>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground/40 ml-2">
                        Not assessed
                      </span>
                    </>
                  )}
                </div>

                {/* 3. PHRASE */}
                {brief.phrase && (
                  <p
                    className="mt-4 text-[17px] italic text-foreground/80"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {brief.phrase}
                  </p>
                )}

                {/* 4. BODY */}
                {brief.body_text && (
                  <p className="mt-2 text-sm text-muted-foreground/70 font-body leading-relaxed">
                    {renderBody(brief.body_text)}
                  </p>
                )}

                {collectBriefBeats(brief).length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {collectBriefBeats(brief).map((beat, index) => (
                      <div key={`${beat.label}-${index}`} className="rounded-lg border border-border/40 bg-white/60 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60 font-body">
                          {beat.label}
                        </p>
                        <p className="mt-1 text-sm text-foreground/85 font-body leading-relaxed">
                          {beat.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4b. SIGNAL PILLS — recomputed from the stored wearable + check-in
                    snapshots so historical briefs show the same Decision
                    Readiness / Physical Reserves / Resilience Capacity
                    capsules as the live brief. */}
                {(() => {
                  if (!brief.wearable_snapshot && !brief.checkin_snapshot) return null;
                  const adapted = snapshotToOuterBriefShape(
                    brief.wearable_snapshot,
                    brief.checkin_snapshot,
                  );
                  const pills = buildExecutivePills(adapted);
                  if (!pills) return null;
                  return (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {pills.map((pill) => (
                        <ReadOnlyPillCapsule key={pill.id} pill={pill} />
                      ))}
                    </div>
                  );
                })()}

                {/* 4c. WEARABLE EVIDENCE — compact reference line */}
                <WearableEvidenceLine wearable={brief.wearable_snapshot} />

                {/* 5. LEAN ON */}
                {brief.lean_on && (
                  <div className="flex items-baseline gap-2 mt-5">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">
                      Lean on
                    </span>
                    <span className="text-sm font-body text-foreground/80 leading-relaxed">
                      {brief.lean_on}
                    </span>
                  </div>
                )}

                {/* 6. WATCH FOR */}
                {brief.watch_for && (
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">
                      Watch for
                    </span>
                    <span className="text-sm font-body text-foreground/80 leading-relaxed">
                      {brief.watch_for}
                    </span>
                  </div>
                )}

                <div className="w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--taupe))]/20 to-transparent my-4" />
                <p className="text-[11px] text-muted-foreground/45 font-body text-center">
                  Read-only snapshot · Live brief available behind this view
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoricalBriefOverlay;
