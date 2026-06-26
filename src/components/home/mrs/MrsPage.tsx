import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useMrsSnapshot } from '@/hooks/useMrsSnapshot';
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
  const queryClient = useQueryClient();
  const { data: outerBrief, refetch, isFetching } = useOuterReadiness();
  // Phase 3.9 — snapshot-read-first. Render from current-window
  // `daily_context_snapshot` when present; otherwise fall through to
  // the live `useOuterReadiness` payload (unchanged).
  const { data: mrsSnapshot } = useMrsSnapshot();
  const snapshotRenderable = !!mrsSnapshot?.isRenderable;
  const score = snapshotRenderable
    ? mrsSnapshot!.score
    : (outerBrief?.innerReadinessScore ?? null);
  const tier = snapshotRenderable
    ? mrsSnapshot!.tier
    : (outerBrief?.innerReadinessTierDisplayed ||
       outerBrief?.innerReadinessTier ||
       null);
  const weekly = useWeeklyMrsDelta();

  const hasScore = typeof score === 'number';
  // Phase 1 — distinguish transient compute/auth failures from true awaiting.
  const engineStatus = (outerBrief as any)?.engineStatus as
    | 'ready' | 'awaiting' | 'auth-failure' | 'inner-failure' | 'outer-failure' | 'stale' | 'unknown-error' | undefined;
  const isFailureState =
    engineStatus === 'auth-failure' ||
    engineStatus === 'inner-failure' ||
    engineStatus === 'outer-failure' ||
    engineStatus === 'unknown-error';
  // If we have a renderable snapshot, suppress the live failure block —
  // we already have a valid score for the current window on screen.
  const showFailureBlock = isFailureState && !snapshotRenderable;
  // Prefer the backend's explicit readiness contract. Stage 1 can be wearable
  // or calendar driven; check-in only upgrades baseline to refined.
  const ws = (outerBrief as any)?.wearableStatus;
  const eligibility = (outerBrief as any)?.readinessEligibility ?? null;
  const stageOneSignalAvailable =
    typeof (outerBrief as any)?.hasCurrentPeriodSignal === 'boolean'
      ? (outerBrief as any).hasCurrentPeriodSignal
      : typeof eligibility?.stageOneSignal === 'boolean'
        ? eligibility.stageOneSignal
      : typeof eligibility?.eligible === 'boolean'
        ? eligibility.eligible
        : !!(ws?.isConnected && ws?.hasTodayData && !ws?.isStale);
  const rawState =
    (snapshotRenderable && mrsSnapshot!.readinessState === 'refined') ||
    (outerBrief as any)?.innerReadinessState === 'refined' ||
    weekly.data?.mode === 'refined'
      ? 'refined'
      : (snapshotRenderable && mrsSnapshot!.readinessState === 'awaiting') ||
        (outerBrief as any)?.innerReadinessState === 'awaiting'
        ? 'awaiting'
        : 'baseline';
  const readinessState: 'baseline' | 'refined' | 'awaiting' =
    rawState === 'refined' && !stageOneSignalAvailable ? 'baseline' : rawState;

  const tierColor = tierColorVar(tier);
  const oneLiner = getReadinessOneLiner(score);
  const stateLabel = getReadinessStateLabel(readinessState, stageOneSignalAvailable);

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

        {/* Phase 1 — engine failure retry block (auth/inner/outer/unknown).
            Suppressed when a current-window snapshot is renderable. */}
        {showFailureBlock && !hasScore && (
          <div className="mt-4 flex flex-col items-center text-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {engineStatus === 'auth-failure' ? 'Session expired' : 'Reading unavailable'}
            </span>
            <span className="text-[11px] text-muted-foreground/60 max-w-[260px]">
              {engineStatus === 'auth-failure'
                ? 'Reconnecting your session. Retry to refresh your score.'
                : 'Couldn\'t reach the readiness service. Retry to refresh.'}
            </span>
            <button
              type="button"
              onClick={() => {
                // Live retry refreshes useOuterReadiness; also invalidate
                // the snapshot query because a successful live compute
                // upserts `daily_context_snapshot` for the current
                // window and we want snapshot-read-first to pick it up.
                refetch();
                queryClient.invalidateQueries({ queryKey: ['mrs-snapshot'] });
              }}
              disabled={isFetching}
              className="mt-1 text-[11px] uppercase tracking-[0.16em] underline-offset-4 hover:underline disabled:opacity-50 text-foreground/80"
            >
              {isFetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {/* One-line read derived from score; state label replaces (Refined)/(Baseline). */}
        {hasScore && oneLiner && !showFailureBlock && (
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
        {!hasScore && !showFailureBlock && (
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
