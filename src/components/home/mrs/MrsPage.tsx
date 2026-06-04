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
      className="w-full h-full overflow-y-auto px-2 md:px-6 pt-0 pb-12"
    >
      <div className="max-w-lg mx-auto rounded-xl card-hero p-4 animate-fade-in">
        {/* Eyebrow row — matches Performance Readiness Brief */}
        <div className="flex items-center justify-between">
          <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))]">
            Mental Readiness Score
          </span>
          <span className="text-caption text-[hsl(var(--muted-foreground-v2))]">
            {getTimeLabel()} · {getDateLabel()}
          </span>
        </div>

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

        {/* Take Assessment — left-edge Goodwood-yellow half tab */}
        <div className="mt-6 -mx-4">
          <button
            type="button"
            onClick={() => navigate('/daily-check-in')}
            className={cn(
              'relative inline-flex items-center overflow-hidden',
              'rounded-r-full rounded-l-none',
              'pl-5 pr-6 py-2.5 text-xs font-semibold tracking-wide',
              'text-[hsl(0_0%_15%)]',
              'bg-[linear-gradient(90deg,hsl(48_98%_52%)_0%,hsl(48_98%_52%/0.88)_60%,hsl(48_98%_52%/0.72)_100%)]',
              'shadow-[0_8px_24px_-8px_hsl(48_98%_52%/0.55)]',
              'transition-transform active:scale-[0.99]',
              'before:absolute before:inset-0 before:rounded-r-full before:pointer-events-none',
              'before:bg-[linear-gradient(180deg,hsl(0_0%_100%/0.28)_0%,hsl(0_0%_100%/0)_55%)]'
            )}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/3 pointer-events-none motion-safe:animate-[tab-shimmer-sweep_3.5s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent_0%,hsl(0_0%_100%/0.45)_50%,transparent_100%)]"
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