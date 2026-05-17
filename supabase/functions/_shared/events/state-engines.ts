// OWNERSHIP: engineering. Runtime derivations over signals — fragmentation,
// carry-over, morning/evening context, high-stakes stacking. Reads from
// ./event-classifier.ts + ./event-subtypes.ts. NOT taxonomy.

import {
  classifyEvent,
  isNoiseTitle,
  scoreEvents,
  selectLeadEvent,
  stakesScore,
  survivesAttendeeOrDurationFloor,
  type CalendarEventLite,
  type EngineFlags,
  type ScoredEvent,
} from "./event-classifier.ts";
import type { DemandDim, Pillar } from "./event-subtypes.ts";
import type { EventCategoryId } from "./event-categories.ts";

// ── Engines §2.18 – §2.23 ────────────────────────────────────────────

export interface DayContext {
  events: CalendarEventLite[];
  yesterdayEvents?: CalendarEventLite[];
  recentDaysHighStakesCount?: number;
  poorRecovery?: boolean;
}

export function detectCognitiveFragmentation(events: CalendarEventLite[]): boolean {
  const sorted = events.filter(survivesAttendeeOrDurationFloor)
    .map((e) => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time || e.start_time).getTime() }))
    .sort((a, b) => a.start - b.start);
  if (sorted.length < 5) {
    let small = 0;
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].start - sorted[i - 1].end) / 60000 < 15) small++;
    }
    return small >= 3;
  }
  for (let i = 0; i + 4 < sorted.length; i++) {
    if ((sorted[i + 4].start - sorted[i].start) / 3600000 <= 6) return true;
  }
  return false;
}

export function detectVisibilityAccumulation(events: CalendarEventLite[]): boolean {
  const visEvents = events.map((e) => ({ e, t: classifyEvent(e.title) }))
    .filter((x) => x.t && x.t.group === 'D_visibility')
    .map((x) => new Date(x.e.start_time).getTime()).sort((a, b) => a - b);
  if (visEvents.length < 2) return false;
  for (let i = 1; i < visEvents.length; i++) {
    if ((visEvents[i] - visEvents[i - 1]) / 3600000 <= 48) return true;
  }
  return false;
}

export function detectEmotionalCarryover(events: CalendarEventLite[]): boolean {
  const enriched = events.map((e) => ({ e, t: classifyEvent(e.title) })).filter((x) => x.t)
    .sort((a, b) => new Date(a.e.start_time).getTime() - new Date(b.e.start_time).getTime());
  for (let i = 0; i < enriched.length; i++) {
    const cur = enriched[i];
    if (cur.t!.primaryPillar !== 3) continue;
    const curEnd = new Date(cur.e.end_time || cur.e.start_time).getTime();
    for (let j = i + 1; j < enriched.length; j++) {
      const next = enriched[j];
      const nextStart = new Date(next.e.start_time).getTime();
      if ((nextStart - curEnd) / 3600000 > 2) break;
      if (next.t!.primaryPillar === 3 || next.t!.primaryPillar === 2) return true;
    }
  }
  return false;
}

export function detectTravelCompression(events: CalendarEventLite[]): boolean {
  const enriched = events.map((e) => ({ e, t: classifyEvent(e.title) }));
  const hasFlight = enriched.some((x) => x.t && x.t.group === 'G_travel');
  if (!hasFlight) return false;
  return enriched.some((x) => x.t && stakesScore(x.t) >= 90);
}

export function detectExecutiveOverextension(ctx: DayContext): boolean {
  return (ctx.recentDaysHighStakesCount ?? 0) >= 3;
}

export function detectIdentityPressureSpike(ctx: DayContext): boolean {
  const enriched = ctx.events.map((e) => ({ e, t: classifyEvent(e.title) }));
  const hasVisibility = enriched.some((x) => x.t && x.t.group === 'D_visibility');
  const hasInvestorOrBoard = enriched.some((x) => x.t && (x.t.group === 'A_governance' || x.t.group === 'B_investor'));
  return hasVisibility && hasInvestorOrBoard && (ctx.poorRecovery === true);
}

export function evaluateAllEngines(ctx: DayContext): EngineFlags {
  return {
    cognitiveFragmentation: detectCognitiveFragmentation(ctx.events),
    visibilityAccumulation: detectVisibilityAccumulation(ctx.events),
    emotionalCarryover: detectEmotionalCarryover(ctx.events),
    travelCompression: detectTravelCompression(ctx.events),
    executiveOverextension: detectExecutiveOverextension(ctx),
    identityPressureSpike: detectIdentityPressureSpike(ctx),
  };
}

// ── Morning / Evening Context ────────────────────────────────────────

import type { RegulationObjective } from "./event-subtypes.ts";

export interface UserStateSnapshot {
  hrv?: number | null;
  rhr?: number | null;
  sleepScore?: number | null;
  mood?: number | null;
  energy?: number | null;
}

export interface MorningContext {
  loadTier: 'light' | 'moderate' | 'heavy' | 'crushing';
  dominantPillar: Pillar | null;
  leadEvent: ScoredEvent | null;
  topEvents: ScoredEvent[];
  engineFlags: EngineFlags;
  carryForward: string[];
  primaryObjective: RegulationObjective;
  pacingHints: string[];
}

export interface EveningContext {
  pillarOfTheDay: Pillar | null;
  carryingNow: string[];
  closeLoops: string[];
  tomorrowLeadEvent: ScoredEvent | null;
  tomorrowLoadTier: 'light' | 'moderate' | 'heavy' | 'crushing';
  primaryObjective: RegulationObjective;
  isSundayPrep: boolean;
}

function tierFromCount(n: number): 'light' | 'moderate' | 'heavy' | 'crushing' {
  if (n <= 2) return 'light';
  if (n <= 4) return 'moderate';
  if (n <= 6) return 'heavy';
  return 'crushing';
}

function dominantPillarOf(scored: ScoredEvent[]): Pillar | null {
  if (scored.length === 0) return null;
  const tally: Record<number, number> = {};
  for (const s of scored) {
    if (!s.type) continue;
    tally[s.type.primaryPillar] = (tally[s.type.primaryPillar] ?? 0) + s.stakes;
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return entries.length ? (Number(entries[0][0]) as Pillar) : null;
}

export function buildMorningContext(
  state: UserStateSnapshot,
  todayEvents: CalendarEventLite[],
  yesterdayCarry: string[] = [],
  recentDaysHighStakesCount: number = 0,
): MorningContext {
  const poorRecovery =
    (state.sleepScore != null && state.sleepScore < 60) ||
    (state.energy != null && state.energy <= 2);
  const ctx: DayContext = { events: todayEvents, recentDaysHighStakesCount, poorRecovery };
  const flags = evaluateAllEngines(ctx);
  const candidates = todayEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  const scored = scoreEvents(candidates, flags).sort((a, b) => b.stakes - a.stakes);
  const lead = selectLeadEvent(todayEvents, flags);
  const dominant = dominantPillarOf(scored);

  let objective: RegulationObjective = 'PREPARE';
  if (flags.cognitiveFragmentation || flags.executiveOverextension) objective = 'PROTECT';
  else if (flags.visibilityAccumulation || flags.emotionalCarryover || flags.identityPressureSpike) objective = 'PREVENT';

  const pacingHints: string[] = [];
  if (flags.cognitiveFragmentation) pacingHints.push('insert micro-resets between back-to-backs');
  if (flags.emotionalCarryover) pacingHints.push('add a decompression bridge after the P3 event');
  if (flags.travelCompression) pacingHints.push('hydrate + circadian anchor before high-stakes window');

  return {
    loadTier: tierFromCount(candidates.length),
    dominantPillar: dominant,
    leadEvent: lead,
    topEvents: scored.slice(0, 3),
    engineFlags: flags,
    carryForward: yesterdayCarry,
    primaryObjective: objective,
    pacingHints,
  };
}

export function buildEveningContext(
  todayEvents: CalendarEventLite[],
  tomorrowEvents: CalendarEventLite[],
  openLoops: string[] = [],
  isSundayPrep: boolean = false,
): EveningContext {
  const todayCandidates = todayEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);
  const todayScored = scoreEvents(todayCandidates).sort((a, b) => b.stakes - a.stakes);
  const pillarOfTheDay = dominantPillarOf(todayScored);

  const carryingNow: string[] = [];
  const totals: Record<DemandDim, number> = { cog: 0, emo: 0, vis: 0, pol: 0, rel: 0, ene: 0, cir: 0, id: 0 };
  for (const s of todayScored) {
    if (!s.type) continue;
    for (const k of Object.keys(totals) as DemandDim[]) totals[k] += s.type.demandProfile[k];
  }
  if (totals.cog >= 4) carryingNow.push('cognitive load');
  if (totals.emo >= 4) carryingNow.push('emotional residue');
  if (totals.id >= 4) carryingNow.push('identity pressure');
  if (totals.vis >= 4) carryingNow.push('post-visibility activation');

  const tmrLead = selectLeadEvent(tomorrowEvents);
  const tmrCandidates = tomorrowEvents.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor);

  const closeLoops = [...openLoops];
  for (const s of todayScored) {
    if (s.type && s.type.primaryPillar === 3 && s.type.timingMatrix.postMandatory) {
      closeLoops.push(`Close: ${s.type.label}`);
    }
  }

  let objective: RegulationObjective = 'RECOVER';
  if (tmrLead && tmrLead.stakes >= 90) objective = 'PREVENT';

  return {
    pillarOfTheDay,
    carryingNow,
    closeLoops,
    tomorrowLeadEvent: tmrLead,
    tomorrowLoadTier: tierFromCount(tmrCandidates.length),
    primaryObjective: objective,
    isSundayPrep,
  };
}

// ── Stacking: consolidate adjacent high-stakes events ────────────────

export interface StackedEventGroup<E extends CalendarEventLite = CalendarEventLite> {
  events: ScoredEvent<E>[];
  consolidated: boolean;
  primaryPillar: EventCategoryId | null;
}

const HIGH_STAKES_PILLARS: EventCategoryId[] = ['A', 'D'];
const STACK_GAP_MINUTES = 90;

export function consolidateAdjacentHighStakes<E extends CalendarEventLite>(
  events: E[],
  flags?: EngineFlags,
): StackedEventGroup<E>[] {
  const scored = scoreEvents(
    events.filter((e) => !isNoiseTitle(e.title)).filter(survivesAttendeeOrDurationFloor),
    flags,
  )
    .filter((s) => s.type && !s.type.classificationOnly)
    .sort((a, b) => new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime());

  const groups: StackedEventGroup<E>[] = [];
  for (const s of scored) {
    const pillar = s.type!.categoryId;
    const isHighStakes = HIGH_STAKES_PILLARS.includes(pillar);
    const last = groups[groups.length - 1];
    if (!last || !isHighStakes) {
      groups.push({ events: [s], consolidated: false, primaryPillar: pillar });
      continue;
    }
    const lastEv = last.events[last.events.length - 1];
    const lastEnd = new Date(lastEv.event.end_time || lastEv.event.start_time).getTime();
    const curStart = new Date(s.event.start_time).getTime();
    const gapMin = (curStart - lastEnd) / 60000;
    const lastIsHighStakes = last.primaryPillar && HIGH_STAKES_PILLARS.includes(last.primaryPillar);
    if (lastIsHighStakes && gapMin < STACK_GAP_MINUTES) {
      last.events.push(s);
      last.consolidated = true;
      continue;
    }
    groups.push({ events: [s], consolidated: false, primaryPillar: pillar });
  }
  return groups;
}
