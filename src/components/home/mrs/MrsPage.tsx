import { useNavigate } from 'react-router-dom';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useWeeklyMrsDelta } from '@/hooks/useWeeklyMrsDelta';
import MrsGauge, { tierColorVar } from './MrsGauge';
import WeeklyDeltaDial from './WeeklyDeltaDial';
import { cn } from '@/lib/utils';
import { getTimeLabel, getDateLabel } from '@/components/home/timeLabel';
import {
  getReadinessOneLiner,
  getReadinessStateLabel,
} from '@/utils/readinessLabels';
import { READINESS_AWAITING_MESSAGE } from '@/constants/awaitingSignals';

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
  // Prefer the backend's explicit readinessEligibility contract (MRS V4).
  // Falls back to deriving from wearableStatus + innerReadinessState for
  // payloads emitted before the contract shipped — but NEVER lets a
  // forwarded 'refined' produce "Full read" without a fresh wearable.
  const ws = (outerBrief as any)?.wearableStatus;
  const eligibility = (outerBrief as any)?.readinessEligibility ?? null;
  const wearableFresh =
    typeof eligibility?.wearableFresh === 'boolean'
      ? eligibility.wearableFresh
      : !!(ws?.isConnected && ws?.hasTodayData && !ws?.isStale);
  const rawState =
    (outerBrief as any)?.innerReadinessState === 'refined' ||
    weekly.data?.mode === 'refined'
      ? 'refined'
      : (outerBrief as any)?.innerReadinessState === 'awaiting'
        ? 'awaiting'
        : 'baseline';
  // Hard gate — refined requires fresh wearable.
  const readinessState: 'baseline' | 'refined' | 'awaiting' =
    rawState === 'refined' && !wearableFresh ? 'baseline' : rawState;

  const tierColor = tierColorVar(tier);
  const oneLiner = getReadinessOneLiner(score);
  const stateLabel = getReadinessStateLabel(readinessState, wearableFresh);

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

        {/* One-line read derived from score; state label replaces (Refined)/(Baseline). */}
        {hasScore && oneLiner && (
          <div className="mt-4 flex flex-col items-center text-center">
            <span
              className="text-base font-medium tracking-wide"
              style={{ color: tierColor }}
            >
              {oneLiner}
            </span>
            <span className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {stateLabel.label}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground/60">
              {stateLabel.subtitle}
            </span>
          </div>
        )}
        {!hasScore && (
          <div className="mt-4 flex flex-col items-center text-center">
            <span className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {stateLabel.label}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground/60">
              {stateLabel.subtitle}
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
              'text-saffron-foreground',
              'bg-[linear-gradient(90deg,hsl(var(--saffron))_0%,hsl(var(--saffron)/0.88)_60%,hsl(var(--saffron)/0.72)_100%)]',
              'shadow-[0_8px_24px_-8px_hsl(var(--saffron)/0.55)]',
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
              Take assessment
            </span>
          </button>
        </div>

        {/* Half-dial weekly delta */}
        <div className="mt-6">
          <WeeklyDeltaDial
            delta={weekly.data?.delta ?? null}
            mode={weekly.data?.mode ?? 'baseline'}
            reason={weekly.data?.reason ?? null}
          />
        </div>
      </div>
    </section>
  );
};

export default MrsPage;
