// MRS V4 — Signal Pills source-of-truth annotation helper.
//
// Extracted from compute-outer-readiness/index.ts so the invariant matrix
// (wearableFresh × checkInFresh × sources) can be unit-tested in isolation
// without booting the full readiness engine.

export type PillKey =
  | 'decision_readiness'
  | 'physical_reserves'
  | 'resilience_capacity';
export type PillTier = 'green' | 'amber' | 'red' | 'neutral';
export type SourceType = 'wearable' | 'checkin' | 'pattern';
export type Freshness = 'fresh' | 'stale' | 'missing' | 'non_score_bearing';

export interface PillInput {
  key: PillKey;
  label: string;
  tier: PillTier;
  tierLabel?: string;
  contributors?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface AnnotatedPill extends PillInput {
  sourceTypes: SourceType[];
  isScoreBearing: boolean;
  freshness: Freshness;
  hiddenReason: 'no_fresh_wearable' | 'no_checkin' | null;
  detail: string | null;
  contributedByCheckIn: boolean;
}

export const PILL_NEUTRAL_LABELS: Record<PillKey, string> = {
  decision_readiness: 'Mind Unread',
  physical_reserves: 'Body Unread',
  resilience_capacity: 'Reserve Unread',
};

export const DETAIL_AWAITING =
  'Sync your wearable and then complete a quick check-in to sharpen the picture.';
export const DETAIL_EARLY_READ =
  'Wearable read only. Complete a check-in to refine this pill.';

export interface AnnotateContext {
  wearableFresh: boolean;
  checkInFresh: boolean;
  hasWearable: boolean;
}

/**
 * Annotate one pill in place with the V4 source-of-truth contract and
 * apply the invariant rules:
 *   - !wearableFresh  → isScoreBearing=false, tier='neutral',
 *                        contributedByCheckIn=false, hiddenReason='no_fresh_wearable'
 *   - wearableFresh && only-checkin sources && !checkInFresh →
 *                        isScoreBearing=false, tier='neutral',
 *                        hiddenReason='no_checkin'
 *   - contributedByCheckIn=true only when wearableFresh && checkInFresh
 *                        AND the pill has a 'checkin' source.
 */
export function annotatePill(
  pill: PillInput,
  sources: SourceType[],
  ctx: AnnotateContext,
): AnnotatedPill {
  const { wearableFresh, checkInFresh, hasWearable } = ctx;
  const hasWearableSrc =
    sources.includes('wearable') || sources.includes('pattern');
  const hasCheckinSrc = sources.includes('checkin');

  let isScoreBearing =
    wearableFresh && (hasWearableSrc || (hasCheckinSrc && checkInFresh));
  let contributedByCheckIn = wearableFresh && checkInFresh && hasCheckinSrc;
  let hiddenReason: 'no_fresh_wearable' | 'no_checkin' | null = null;
  let detail: string | null = null;
  let tier: PillTier = pill.tier;
  let tierLabel = pill.tierLabel;

  if (!wearableFresh) {
    hiddenReason = 'no_fresh_wearable';
    isScoreBearing = false;
    contributedByCheckIn = false;
    tier = 'neutral';
    tierLabel = PILL_NEUTRAL_LABELS[pill.key];
    detail = DETAIL_AWAITING;
  } else if (!hasWearableSrc && !hasCheckinSrc) {
    hiddenReason = 'no_fresh_wearable';
    isScoreBearing = false;
    tier = 'neutral';
    tierLabel = PILL_NEUTRAL_LABELS[pill.key];
    detail = DETAIL_AWAITING;
  } else if (!checkInFresh && !hasWearableSrc && hasCheckinSrc) {
    hiddenReason = 'no_checkin';
    isScoreBearing = false;
    tier = 'neutral';
    tierLabel = PILL_NEUTRAL_LABELS[pill.key];
    detail = DETAIL_EARLY_READ;
  } else if (!checkInFresh) {
    detail = DETAIL_EARLY_READ;
  }

  let freshness: Freshness;
  if (isScoreBearing) freshness = 'fresh';
  else if (!hasWearable) freshness = 'missing';
  else if (!wearableFresh) freshness = 'stale';
  else freshness = 'non_score_bearing';

  return {
    ...pill,
    tier,
    tierLabel,
    sourceTypes: sources,
    isScoreBearing,
    freshness,
    hiddenReason,
    detail,
    contributedByCheckIn,
  };
}

/** Defensive normalisation — guarantees the invariants hold. */
export function enforcePillInvariants(
  pills: AnnotatedPill[],
  ctx: AnnotateContext,
): AnnotatedPill[] {
  return pills.map((p) => {
    if (!ctx.wearableFresh) {
      return {
        ...p,
        isScoreBearing: false,
        contributedByCheckIn: false,
        tier: 'neutral',
        tierLabel: PILL_NEUTRAL_LABELS[p.key],
        hiddenReason: p.hiddenReason ?? 'no_fresh_wearable',
        freshness: ctx.hasWearable ? 'stale' : 'missing',
      };
    }
    if (!ctx.checkInFresh && p.contributedByCheckIn) {
      return { ...p, contributedByCheckIn: false };
    }
    return p;
  });
}