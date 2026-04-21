/**
 * HistoricalBriefOverlay
 * Frosted-glass overlay rendered above /executive-home that displays a past
 * Performance Readiness Brief snapshot. Visual layout mirrors the live brief
 * card. Read-only (no feedback, no signal-pill expansion, no CTAs).
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBriefSnapshot } from '@/hooks/useBriefSnapshot';

interface Props {
  briefId: string;
  onClose: () => void;
}

const TIER_COLOR: Record<string, string> = {
  depleted: 'text-[hsl(var(--state-depleted))]',
  managing: 'text-[hsl(var(--saffron))]',
  strong: 'text-[hsl(var(--kairos))]',
  peak: 'text-[hsl(var(--kairos))]',
};

const TIER_LABEL: Record<string, string> = {
  depleted: 'LOW RESERVE',
  managing: 'MODERATE',
  strong: 'STRONG',
  peak: 'PEAK',
};

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
        className="fixed top-3 right-3 md:top-4 md:right-4 z-50 w-10 h-10 rounded-full bg-background/70 backdrop-blur-sm border border-border/40 hover:bg-background/90 flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors shadow-sm"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="min-h-full flex items-start justify-center px-4 pt-20 pb-12 md:pt-24">
        <div className="w-full max-w-lg">
          <div className="rounded-xl bg-white/85 backdrop-blur-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-4 border-l-2 border-l-taupe/40">
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
                      <span className={cn('text-[40px] font-medium leading-none', tierColor)}>
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