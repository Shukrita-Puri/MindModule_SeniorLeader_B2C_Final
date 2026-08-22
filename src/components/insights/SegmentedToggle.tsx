/**
 * SegmentedToggle — shared Insights switcher.
 *
 * Presentation-only. Same visual language as the 1M / 6M / 1Y range control
 * on the Performance Trajectory card: one pill-shaped muted track, active
 * segment as a raised light pill, inactive segments as quiet grey labels.
 *
 * `size="compact"` = inline right-aligned (1M/6M/1Y).
 * `size="full"`    = full-width, equal segments (card tab bars on mobile).
 */

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'compact' | 'full';
  uppercase?: boolean;
  className?: string;
  ariaLabel?: string;
}

function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  size = 'full',
  uppercase = false,
  className,
  ariaLabel,
}: SegmentedToggleProps<T>) {
  const full = size === 'full';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center rounded-full bg-muted/40',
        full ? 'w-full p-1 gap-0.5' : 'gap-1 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-full transition-colors whitespace-nowrap text-center',
              full
                ? 'flex-1 min-w-0 px-1 py-2 min-h-[34px] text-[12px] font-medium tracking-[-0.01em]'
                : 'px-2.5 py-1 text-[10px] tracking-[0.12em]',
              uppercase && 'uppercase',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedToggle;
