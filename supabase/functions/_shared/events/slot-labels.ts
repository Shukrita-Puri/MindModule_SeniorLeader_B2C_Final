// OWNERSHIP: engineering.
//
// Shared slot-label composer. Lifted out of `generate-mastery-plan/index.ts`
// (formerly `composeStateLabel`) so Brief / Plan / future surfaces share one
// source of truth for state-anchored slot copy and the anchor metadata that
// rides along with each slot.
//
// Pure: no DB, no IO. Caller injects all dependencies + raw context.
//
// Priority preserved from the legacy implementation:
//   distinct event > calendar load > wearable deficit > tomorrow/week load
//
// Variable-slot rule preserved: slot index ≥ 1 returns null when no
// meaningful secondary anchor exists, so the caller drops the slot rather
// than padding with a duplicate.

import { enrichEvent } from './enrich-event.ts';
import type { EventCategoryId } from './event-categories.ts';
import type { DemandProfile } from './event-subtypes.ts';

export interface SlotAnchorMeta {
  anchorEventId: string | null;
  anchorCategoryId: EventCategoryId | null;
  anchorSubtypeId: string | null;
  anchorScenarioId: string | null;
  anchorLeadTimeMin: number | null;
  /** Enriched-event extras — added so downstream surfaces don't re-classify. */
  anchorTitle: string | null;
  anchorDemandProfile: DemandProfile | null;
  anchorPhases: { pre?: unknown; during?: unknown; post?: unknown } | null;
}

export interface SlotLabelResult {
  label: string;
  /** Convenience mirrors used by older call sites. */
  eventId: string | null;
  categoryId: EventCategoryId | null;
  subtypeId: string | null;
  scenarioId: string | null;
  leadTimeMin: number | null;
  /** Fuller enriched-event snapshot for slot persistence. */
  anchorMeta: SlotAnchorMeta;
}

export interface SlotLabelContext {
  slotIndex: 0 | 1 | 2;

  /** Today's still-upcoming events. */
  todayRemainingEvents: Array<{ id?: string | null; title?: string | null }>;
  /** Tomorrow's events. */
  tomorrowEvents: Array<{ id?: string | null; title?: string | null }>;

  /** Wearable summary the same shape Plan already passes. */
  wearable: {
    hasData?: boolean;
    hrvDeviation: number | null;
    sleepScore: number | null;
  } | null;

  tier: string | null;
  checkIn: string | null;
  load: string | null;
  pressure: string | null;
  timezoneOffsetMinutes: number;

  // Injected helpers so this module stays decoupled from the Plan closure.
  pickAnchorEvent: (candidates: any[]) => any | null;
  scoreEventStakes: (e: any) => number;
  truncateTitle: (t: string | null | undefined, n?: number) => string | null;
  isTravelTitle: (t: string | null | undefined) => boolean;
}

function emptyAnchorMeta(): SlotAnchorMeta {
  return {
    anchorEventId: null,
    anchorCategoryId: null,
    anchorSubtypeId: null,
    anchorScenarioId: null,
    anchorLeadTimeMin: null,
    anchorTitle: null,
    anchorDemandProfile: null,
    anchorPhases: null,
  };
}

export function composeSlotStateLabel(ctx: SlotLabelContext): SlotLabelResult | null {
  const {
    slotIndex,
    todayRemainingEvents,
    tomorrowEvents,
    wearable: w,
    tier,
    checkIn,
    load,
    pressure,
    timezoneOffsetMinutes,
    pickAnchorEvent,
    scoreEventStakes,
    truncateTitle,
    isTravelTitle,
  } = ctx;

  const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  const dow = localNow.getUTCDay(); // 0 Sun .. 6 Sat
  const isWeekend = dow === 0 || dow === 6;

  const todaySorted = [...todayRemainingEvents].sort(
    (a, b) => scoreEventStakes(b) - scoreEventStakes(a),
  );
  const tomorrowSorted = [...tomorrowEvents].sort(
    (a, b) => scoreEventStakes(b) - scoreEventStakes(a),
  );
  const candidateList = slotIndex === 2
    ? [...tomorrowSorted, ...todaySorted]
    : [...todaySorted, ...tomorrowSorted];

  const anchorEvent = pickAnchorEvent(candidateList);
  const anchorEnriched = anchorEvent ? enrichEvent(anchorEvent) : null;
  const anchorCategory = anchorEnriched?.categoryId ?? null;
  const anchorDemand = anchorEnriched?.demandProfile ?? null;
  const anchorTitle = truncateTitle(anchorEvent?.title);
  const anchorIsTravel = isTravelTitle(anchorEvent?.title);
  const anchorIsTomorrow = !!(
    anchorEvent && tomorrowEvents.some((e: any) => e.id === anchorEvent.id)
  );

  // 1) State action.
  let stateAction = '';
  if (anchorCategory === 'G' || (anchorDemand && anchorDemand.cir >= 2) || anchorIsTravel) {
    stateAction = 'Re-anchor circadian rhythm';
  } else if (w?.hasData && w.hrvDeviation !== null && w.hrvDeviation < -10) {
    stateAction = 'Restore HRV';
  } else if (w?.hasData && w.sleepScore !== null && w.sleepScore < 65) {
    stateAction = 'Recover sleep debt';
  } else if (tier === 'depleted' || checkIn === 'drained' || checkIn === 'struggling') {
    const highVisibility = anchorCategory === 'C' || anchorCategory === 'F';
    const highEmotional = !!(anchorDemand && anchorDemand.emo >= 3);
    stateAction = (highVisibility && !highEmotional)
      ? 'Reset stage chemistry'
      : 'Settle the system';
  } else if (load === 'high' || pressure === 'high') {
    stateAction = 'Decompress';
  } else if (tier === 'managing') {
    const cogDominant = !!(
      anchorDemand && anchorDemand.cog >= 3 && anchorDemand.emo <= 1 && anchorDemand.ene <= 1
    );
    stateAction = (anchorCategory === 'E' || cogDominant)
      ? 'Prime for focus'
      : 'Re-consolidate focus';
  } else {
    stateAction = slotIndex === 2 ? 'Build capacity' : 'Steady the system';
  }

  // 2) Anchor phrase.
  let anchor = '';
  let anchorEventId: string | null = null;
  const highLoad = load === 'high' || pressure === 'high';
  const hrvDeficit = !!(w?.hasData && w.hrvDeviation !== null && w.hrvDeviation < -10);
  const sleepDeficit = !!(w?.hasData && w.sleepScore !== null && w.sleepScore < 65);

  if (anchorEvent) {
    anchorEventId = anchorEvent.id ?? null;
    if (anchorIsTravel) {
      anchor = anchorIsTomorrow ? 'long-haul travel tomorrow' : 'long-haul travel today';
    } else {
      anchor = `${anchorIsTomorrow ? "tomorrow's" : "today's"} ${anchorTitle}`;
    }
  } else if (highLoad) {
    anchor = slotIndex === 2 ? "today's dense calendar" : "today's back-to-back load";
  } else if (hrvDeficit || sleepDeficit) {
    anchor = "tomorrow's load";
  } else if (slotIndex === 2) {
    if (isWeekend && dow === 0) anchor = "Monday's load";
    else if (isWeekend) anchor = "next week\u2019s load";
    else if (tomorrowEvents.length > 0) anchor = "tomorrow's calendar";
    else anchor = "tomorrow's load";
  } else {
    anchor = "today's load";
  }

  // Variable-slot rule: index ≥ 1 must have meaningful secondary signal.
  if (
    slotIndex >= 1 &&
    !anchorEvent &&
    !highLoad &&
    !hrvDeficit &&
    !sleepDeficit &&
    !(slotIndex === 2 && tomorrowEvents.length > 0) &&
    !(slotIndex === 2 && isWeekend)
  ) {
    return null;
  }

  const anchorMeta: SlotAnchorMeta = anchorEnriched
    ? {
        anchorEventId,
        anchorCategoryId: anchorCategory,
        anchorSubtypeId: anchorEnriched.subtype?.id ?? null,
        anchorScenarioId: anchorEnriched.scenarioId ?? null,
        anchorLeadTimeMin: anchorEnriched.leadTimeMin ?? null,
        anchorTitle: anchorTitle,
        anchorDemandProfile: anchorDemand,
        anchorPhases: anchorEnriched.phases ?? null,
      }
    : emptyAnchorMeta();

  return {
    label: `${stateAction} ahead of ${anchor}`,
    eventId: anchorEventId,
    categoryId: anchorCategory,
    subtypeId: anchorEnriched?.subtype?.id ?? null,
    scenarioId: anchorEnriched?.scenarioId ?? null,
    leadTimeMin: anchorEnriched?.leadTimeMin ?? null,
    anchorMeta,
  };
}