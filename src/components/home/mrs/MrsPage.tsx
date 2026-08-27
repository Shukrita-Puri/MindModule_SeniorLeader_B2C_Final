import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOuterReadiness, type OuterReadinessData } from '@/hooks/useOuterReadiness';
import { useMrsSnapshot } from '@/hooks/useMrsSnapshot';
import { useWeeklyMrsDelta } from '@/hooks/useWeeklyMrsDelta';
import { useWearableSync } from '@/hooks/useWearableSync';
import { useExecutiveHomeCardsRefresh } from '@/hooks/useExecutiveHomeCardsRefresh';
import MrsGauge, { tierColorVar } from './MrsGauge';
import WeeklyDeltaDial from './WeeklyDeltaDial';
import { cn } from '@/lib/utils';
import { getTimeLabel, getDateLabel } from '@/components/home/timeLabel';
import {
  getReadinessOneLiner,
  getReadinessStateLabel,
} from '@/utils/readinessLabels';
import { resolveAwaitingSignalsCopy } from '@/hooks/useAwaitingSignalsCopy';
import { AwaitingSignalsNotice } from '@/components/home/AwaitingSignalsNotice';
import { useTourMock } from '@/components/onboarding/useTourMock';
import { MOCK_MRS } from '@/components/onboarding/tourMockData';
import EngravedLoader from '@/components/ui/engraved-loader';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, RefreshCw } from 'lucide-react';

type MrsOuterReadiness = OuterReadinessData & {
  readinessEligibility?: {
    stageOneSignal?: boolean;
    eligible?: boolean;
  } | null;
};

const MrsPage = () => {
  const [weekOverWeekOpen, setWeekOverWeekOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Snapshot-only home: do NOT invoke the live `compute-outer-readiness`
  // pipeline on mount. The query is disabled under HOME_SNAPSHOT_ONLY, so
  // `outerBrief` is effectively `undefined` unless a manual refresh has
  // populated the persistent cache. Retry uses the manual cards refresh.
  const { data: outerBrief } = useOuterReadiness({ snapshotOnly: true });
  const refreshCards = useExecutiveHomeCardsRefresh();
  const isFetching = refreshCards.isPending;
  const mrsBrief = outerBrief as MrsOuterReadiness | null | undefined;
  const { shouldRenderMock: showTourMockMrs } = useTourMock();
  // Phase 3.9 — snapshot-read-first. Render from current-window
  // `daily_context_snapshot` when present; otherwise fall through to
  // the live `useOuterReadiness` payload (unchanged).
  const { data: mrsSnapshot, isLoading: mrsLoading } = useMrsSnapshot();
  const { isBackfilling } = useWearableSync();
  const snapshotRenderable = !!mrsSnapshot?.isRenderable;

  const liveScore = snapshotRenderable
    ? mrsSnapshot!.score
    : (outerBrief?.innerReadinessScore ?? null);
  const liveTier = snapshotRenderable
    ? mrsSnapshot!.tier
    : (outerBrief?.innerReadinessTierDisplayed ||
       outerBrief?.innerReadinessTier ||
       null);
  const score = showTourMockMrs ? MOCK_MRS.score : liveScore;
  const tier = showTourMockMrs ? MOCK_MRS.tier : liveTier;
  const weekly = useWeeklyMrsDelta();

  const hasScore = typeof score === 'number';
  // Never render a partial score. While the snapshot read is still in flight
  // (or a manual refresh is recomputing) and no score exists yet, show the
  // EngravedLoader instead of an empty gauge that would later jump to a value.
  const showScoreLoader =
    !hasScore &&
    !snapshotRenderable &&
    (mrsLoading || refreshCards.isPending);
  // Phase 1 — distinguish transient compute/auth failures from true awaiting.
  const engineStatus = mrsBrief?.engineStatus;
  const isFailureState =
    engineStatus === 'auth-failure' ||
    engineStatus === 'session-failure' ||
    engineStatus === 'inner-failure' ||
    engineStatus === 'outer-failure' ||
    engineStatus === 'unknown-error';
  // If we have a renderable snapshot, suppress the live failure block —
  // we already have a valid score for the current window on screen.
  const showFailureBlock = isFailureState && !snapshotRenderable;
  // Prefer the backend's explicit readiness contract. Stage 1 can be wearable
  // or calendar driven; check-in only upgrades baseline to refined.
  const ws = mrsBrief?.wearableStatus;
  const eligibility = mrsBrief?.readinessEligibility ?? null;
  // When a current-window snapshot is renderable, the snapshot is the
  // authoritative source for MRS card display. A numeric score implies
  // at minimum a Stage 1 signal was available at compute time.
  const stageOneSignalAvailable = snapshotRenderable
    ? true
    : typeof mrsBrief?.hasCurrentPeriodSignal === 'boolean'
      ? mrsBrief.hasCurrentPeriodSignal
      : typeof eligibility?.stageOneSignal === 'boolean'
        ? eligibility.stageOneSignal
      : typeof eligibility?.eligible === 'boolean'
        ? eligibility.eligible
        : !!(ws?.isConnected && ws?.hasTodayData && !ws?.isStale);
  const rawState =
    (snapshotRenderable && mrsSnapshot!.readinessState === 'refined') ||
    mrsBrief?.innerReadinessState === 'refined' ||
    weekly.data?.mode === 'refined'
      ? 'refined'
      : (snapshotRenderable && mrsSnapshot!.readinessState === 'awaiting') ||
        mrsBrief?.innerReadinessState === 'awaiting'
        ? 'awaiting'
        : 'baseline';
  const readinessState: 'baseline' | 'refined' | 'awaiting' = showTourMockMrs
    ? MOCK_MRS.readinessState
    : snapshotRenderable
    ? (mrsSnapshot!.readinessState === 'refined' ? 'refined' : 'baseline')
    : rawState === 'refined' && !stageOneSignalAvailable
      ? 'baseline'
      : rawState;
  // Only consult live awaiting copy when no renderable snapshot exists.
  // Otherwise the snapshot score is authoritative and awaiting/sync-delayed
  // copy from live outerBrief would contradict the visible score.
  const awaitingCopy = snapshotRenderable
    ? ''
    : resolveAwaitingSignalsCopy(outerBrief ?? undefined);

  const tierColor = tierColorVar(tier);
  const oneLiner = showTourMockMrs ? MOCK_MRS.oneLiner : getReadinessOneLiner(score);
  const stateLabel = showTourMockMrs
    ? { label: MOCK_MRS.stateLabel, subtitle: MOCK_MRS.stateSubtitle }
    : getReadinessStateLabel(readinessState, stageOneSignalAvailable);

  return (
    <section
      data-tour="mrs-page"
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
        {showScoreLoader ? (
          <div className="mt-5 flex justify-center">
            <EngravedLoader label="Reading your signals…" />
          </div>
        ) : (
          <div className="mt-5 flex justify-center">
            <MrsGauge score={score} tier={tier} size={232} />
          </div>
        )}

        {/* Phase 1 — engine failure retry block (auth/inner/outer/unknown).
            Suppressed when a current-window snapshot is renderable. */}
        {showFailureBlock && !hasScore && !showScoreLoader && (
          <div className="mt-4 flex flex-col items-center text-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {engineStatus === 'auth-failure' || engineStatus === 'session-failure' ? 'Session expired' : 'Reading unavailable'}
            </span>
            <span className="text-[11px] text-muted-foreground/60 max-w-[260px]">
              {engineStatus === 'auth-failure' || engineStatus === 'session-failure'
                ? 'We couldn\u2019t verify your session. Please refresh or sign in again.'
                : 'Couldn\'t reach the readiness service. Retry to refresh.'}
            </span>
            <button
              type="button"
              onClick={() => {
                // Snapshot-only home: retry regenerates the persisted
                // MRS/Brief/Plan snapshots via the cron orchestrator,
                // then invalidates the snapshot query so the card
                // re-reads the fresh row.
                refreshCards.mutate(undefined, {
                  onSettled: () => {
                    queryClient.invalidateQueries({ queryKey: ['mrs-snapshot'] });
                  },
                });
              }}
              disabled={isFetching}
              className="mt-1 text-[11px] uppercase tracking-[0.16em] underline-offset-4 hover:underline disabled:opacity-50 text-foreground/80"
            >
              {isFetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {/* One-line read derived from score; state label replaces (Refined)/(Baseline). */}
        {hasScore && oneLiner && !showFailureBlock && !showScoreLoader && (
          <div className="mt-4 flex flex-col items-center text-center">
            <span
              className="text-base font-medium tracking-wide"
              style={{ color: tierColor }}
            >
              {oneLiner}
            </span>
            <span className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              {stateLabel.label}
              {refreshCards.isPending && (
                <span className="text-[10px] text-[hsl(var(--muted-foreground-v2))] tracking-wide uppercase font-body ml-2 animate-pulse">
                  Updating
                </span>
              )}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground/60">
              {stateLabel.label === 'Awaiting signals' ? awaitingCopy : stateLabel.subtitle}
            </span>
          </div>
        )}
        {!hasScore && !showFailureBlock && !showScoreLoader && (
          stateLabel.label === 'Awaiting signals' ? (
            <AwaitingSignalsNotice copy={awaitingCopy} className="mt-6" />
          ) : (
            <div className="mt-4 flex flex-col items-center text-center">
              <span className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                {stateLabel.label}
              </span>
              <span className="mt-0.5 text-[11px] text-muted-foreground/60">
                {stateLabel.subtitle}
              </span>
            </div>
          )
        )}

        {/* Historical Backfill UI */}
        {isBackfilling && (
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-muted/60 animate-in fade-in slide-in-from-bottom-2">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                Syncing your health history…
              </span>
            </div>
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
              'pl-6 pr-7 py-3.5 text-sm font-semibold tracking-wide',
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

        {/* Week over week — collapsible, closed by default */}
        <Collapsible open={weekOverWeekOpen} onOpenChange={setWeekOverWeekOpen} className="mt-6">
          <CollapsibleTrigger className="flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium hover:text-muted-foreground/70 transition-colors cursor-pointer">
            Week over week
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", weekOverWeekOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3">
              <WeeklyDeltaDial
                currentScore={score}
                thisWeekAvg={showTourMockMrs ? MOCK_MRS.score : (weekly.data?.thisWeekAvg ?? null)}
                lastWeekAvg={showTourMockMrs ? MOCK_MRS.score - MOCK_MRS.weeklyDelta : (weekly.data?.lastWeekAvg ?? null)}
                delta={showTourMockMrs ? MOCK_MRS.weeklyDelta : (weekly.data?.delta ?? null)}
                mode={showTourMockMrs ? 'refined' : (weekly.data?.mode ?? 'baseline')}
                reason={showTourMockMrs ? null : (weekly.data?.reason ?? null)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
};

export default MrsPage;
