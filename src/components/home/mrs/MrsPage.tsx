import { useNavigate } from 'react-router-dom';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useWeeklyMrsDelta } from '@/hooks/useWeeklyMrsDelta';
import MrsGauge, { tierColorVar } from './MrsGauge';
import WeeklyDeltaDial from './WeeklyDeltaDial';
import { cn } from '@/lib/utils';

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const MrsPage = () => {
  const navigate = useNavigate();
  const { data: outerBrief } = useOuterReadiness();
  const score = outerBrief?.innerReadinessScore ?? null;
  const tier =
    outerBrief?.innerReadinessTierDisplayed ||
    outerBrief?.innerReadinessTier ||
    null;
  const weekly = useWeeklyMrsDelta();

  const hasScore = typeof score === 'number';
  const readinessState =
    (outerBrief as any)?.innerReadinessState === 'refined' ||
    weekly.data?.mode === 'refined'
      ? 'refined'
      : 'baseline';

  const tierColor = tierColorVar(tier);

  return (
    <section
      aria-label="Mental Readiness Score"
      className="w-full h-full overflow-y-auto px-5 pt-2 pb-12"
    >
      <div className="max-w-md mx-auto">
        {/* Title — bold eyebrow, matches brief eyebrow */}
        <p className="text-eyebrow text-foreground text-center mt-2">
          Mental Readiness Score
        </p>

        {/* Gauge */}
        <div className="mt-5 flex justify-center">
          <MrsGauge score={score} tier={tier} size={232} />
        </div>

        {/* Tier label only — no "Current tier ·" prefix */}
        {tier && hasScore && (
          <div className="mt-4 flex flex-col items-center">
            <span
              className="text-base font-medium tracking-wide"
              style={{ color: tierColor }}
            >
              {titleCase(tier)}
            </span>
            <span className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {readinessState}
            </span>
          </div>
        )}

        {/* Take Assessment pill — left aligned, saffron, pulsing, no icon */}
        <div className="mt-6 flex justify-start">
          <button
            type="button"
            onClick={() => navigate('/daily-check-in')}
            className={cn(
              'relative inline-flex items-center justify-center rounded-full',
              'bg-saffron text-saffron-foreground',
              'px-5 py-2 text-xs font-semibold tracking-wide',
              'shadow-[0_6px_18px_-6px_hsl(var(--saffron)/0.7)]',
              'transition-transform hover:scale-[1.02] active:scale-[0.99]',
              'motion-safe:animate-pulse'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-0 rounded-full',
                'ring-2 ring-[hsl(var(--saffron)/0.35)]',
                'motion-safe:animate-ping pointer-events-none'
              )}
            />
            <span className="relative">
              {hasScore ? 'Take assessment' : 'Check in to generate your score'}
            </span>
          </button>
        </div>

        {/* Half-dial weekly delta */}
        <div className="mt-6">
          <WeeklyDeltaDial
            delta={weekly.data?.delta ?? null}
            mode={weekly.data?.mode ?? 'baseline'}
          />
        </div>
      </div>
    </section>
  );
};

export default MrsPage;