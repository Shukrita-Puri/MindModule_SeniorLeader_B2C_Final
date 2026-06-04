import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface InsightSummaryRowProps {
  to: string;
  /** Bold uppercase eyebrow — now carries the full card title. */
  eyebrow: string;
  /** One signal-bearing line, derived from already-loaded state. */
  value?: string | null;
  loading?: boolean;
}

/**
 * Apple-Health-style collapsed summary row for the /insights stack.
 * Borderless glass card, no icon, no right-side metric — eyebrow + value + chevron.
 */
const InsightSummaryRow = ({ to, eyebrow, value, loading }: InsightSummaryRowProps) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        'w-full text-left rounded-2xl bg-white',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'transition-transform duration-200 active:scale-[0.99]',
        'px-5 py-4 flex items-center gap-3'
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-foreground">
          {eyebrow}
        </span>
        {loading ? (
          <div className="mt-2 h-3 w-40 rounded bg-muted/40 animate-pulse" />
        ) : value ? (
          <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{value}</p>
        ) : null}
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground/60 flex-shrink-0" />
    </button>
  );
};

export default InsightSummaryRow;