import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface InsightSummaryRowProps {
  to: string;
  icon: LucideIcon;
  iconColor?: string;
  eyebrow: string;
  title: string;
  value?: string | null;
  subValue?: string | null;
  loading?: boolean;
}

/**
 * Apple-Health-style collapsed summary row for the /insights stack.
 * Tap → navigate to the full per-card detail page.
 */
const InsightSummaryRow = ({
  to,
  icon: Icon,
  iconColor = 'text-foreground',
  eyebrow,
  title,
  value,
  subValue,
  loading,
}: InsightSummaryRowProps) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        'w-full text-left rounded-2xl bg-card/80 backdrop-blur-md',
        'border border-border/40 hover:border-border/70',
        'shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]',
        'transition-all duration-200 active:scale-[0.99]',
        'px-4 py-4 flex items-start gap-3'
      )}
    >
      <div className={cn('flex-shrink-0 w-9 h-9 rounded-full bg-muted/40 flex items-center justify-center', iconColor)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[11px] font-medium tracking-widest uppercase', iconColor)}>
            {eyebrow}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
        </div>
        <h3 className="text-[17px] font-headline text-foreground leading-tight mt-1 truncate">
          {title}
        </h3>
        {loading ? (
          <div className="mt-2 h-3 w-32 rounded bg-muted/40 animate-pulse" />
        ) : value ? (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{value}</p>
        ) : null}
        {subValue && !loading && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{subValue}</p>
        )}
      </div>
    </button>
  );
};

export default InsightSummaryRow;