import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Single presentational owner of the "Awaiting signals" state across the
 * three executive cards (MRS, Brief, Plan).
 *
 * Typography is fixed here so the three surfaces can never drift:
 *   • label — 11px uppercase, tracking 0.18em, muted-foreground/80
 *   • copy  — 11px, muted-foreground/60
 *
 * The sentence itself is resolved by `useAwaitingSignalsCopy` so all three
 * cards print the same signal-relevant line at any point in time.
 */
export interface AwaitingSignalsNoticeProps {
  copy: string;
  align?: 'center' | 'start';
  className?: string;
  /** Optional trailing node rendered inline after the copy (e.g. a chevron). */
  trailing?: React.ReactNode;
}

export const AWAITING_SIGNALS_LABEL = 'Awaiting signals';

export const AwaitingSignalsNotice: React.FC<AwaitingSignalsNoticeProps> = ({
  copy,
  align = 'center',
  className,
  trailing,
}) => (
  <div
    className={cn(
      'flex flex-col',
      align === 'center' ? 'items-center text-center' : 'items-start text-left',
      className,
    )}
  >
    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
      {AWAITING_SIGNALS_LABEL}
    </span>
    <span className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground/60">
      <span>{copy}</span>
      {trailing}
    </span>
  </div>
);

export default AwaitingSignalsNotice;
