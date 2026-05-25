// JIT v2 — single triangulated selector. Replaces the legacy scorer +
// jit-candidates ranker after shadow week. See `.lovable/plan.md` for
// the contract. This file is the ONLY place where Immediate / Tactical
// / Strategic combine into an `importance` score.

import { enrichEvent } from '../events/enrich-event.ts';
import type { EventCategoryId } from '../events/event-categories.ts';
import { isPersonalNoise } from './noise-filters.ts';
import { dominantRole, relationshipWeight, type ResolvedRole } from './relationship-weights.ts';
import {
  classifyEventBucket,
  patternHit,
  userPriorityTagBoost,
  skipPenaltyFor,
  followThroughBoost,
  type PatternSignal,
} from './tactical-signals.ts';
import { goalAlignment, type UserGoals } from './goal-alignment.ts';
import { resolveTierWeights, type TierWeights } from './maturity-tier.ts';

/** §3 framework category base (0..40). */
const CATEGORY_BASE: Record<EventCategoryId, number> = {
  A: 40, C: 30, F: 30, G: 25, D: 20, B: 15, E: 10, H: 5,
};

const STAKES_KEYWORDS: Array<{ pts: number; words: string[] }> = [
  { pts: 15, words: ['board', 'investor', 'fundraise', 'm&a', 'ipo'] },
  { pts: 10, words: ['external', 'client', 'customer', 'partner'] },
  { pts: 5,  words: ['leadership', 'exec', 'all-hands', 'all hands'] },
];

function stakesHint(title: string): number {
  const t = ` ${title.toLowerCase()} `;
  for (const tier of STAKES_KEYWORDS) {
    if (tier.words.some((w) => t.includes(w))) return tier.pts;
  }
  return 0;
}

/** Provisional — revisit after shadow week with real distribution. */
export const MIN_IMMEDIATE = 25;

export interface SelectInputEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  /** Resolved roles for known attendees (from attendee_relationships). */
  attendeeRoles?: ResolvedRole[];
  /** User-declared priority tags on the event. */
  tags?: string[];
}

export interface SelectContext {
  /** Account age in whole days. Drives tier floor. */
  accountAgeDays: number;
  /** Latest causality_findings.signal_summary or null. */
  signalSummary: any | null;
  /** Per-bucket skip counts (last 30d). */
  skipCountsByBucket: Record<string, number>;
  /** Per-bucket "JIT done + felt-better" counts (last 30d). */
  followThroughByBucket: Record<string, number>;
  /** User strategic goals snapshot. */
  goals: UserGoals | null;
  /** Now in ms — defaults to Date.now(). */
  nowMs?: number;
}

export interface SelectedCandidate {
  eventId: string;
  title: string;
  categoryId: EventCategoryId;
  bucket: string | null;
  role: ResolvedRole;
  startMs: number;
  minutesUntilStart: number;
  /** Final importance after tier weighting. */
  importance: number;
  /** Tier the score was computed under. */
  tier: TierWeights;
  components: {
    immediate: number;
    tactical: number;
    strategic: number;
    strategicGate: 0 | 1;
    breakdown: {
      categoryBase: number;
      relationship: number;
      stakes: number;
      patternScore: number;
      priorityTag: number;
      skipPenalty: number;
      followThrough: number;
      goalAlignment: number;
    };
    patternSignal: PatternSignal | null;
  };
  reason?: string;
}

export interface SelectResult {
  ranked: SelectedCandidate[];
  excluded: Array<{ eventId: string; title: string; reason: string }>;
  tier: TierWeights;
}

/**
 * Pure function — no I/O. Caller is responsible for loading patterns,
 * skip counts, attendee roles, etc. and passing them in.
 */
export function selectJitCandidates(
  events: SelectInputEvent[],
  ctx: SelectContext,
): SelectResult {
  const nowMs = ctx.nowMs ?? Date.now();
  const tier = resolveTierWeights(ctx.accountAgeDays, ctx.signalSummary);
  const ranked: SelectedCandidate[] = [];
  const excluded: Array<{ eventId: string; title: string; reason: string }> = [];

  for (const ev of events) {
    const title = ev.title || '';
    if (isPersonalNoise(title)) {
      excluded.push({ eventId: ev.id, title, reason: 'personal_noise' });
      continue;
    }
    const enriched = enrichEvent({ title });
    if (!enriched.categoryId) {
      excluded.push({ eventId: ev.id, title, reason: 'no_category' });
      continue;
    }

    // Immediate
    const role = dominantRole(ev.attendeeRoles ?? []);
    const categoryBase = CATEGORY_BASE[enriched.categoryId];
    const rel = relationshipWeight(role);
    const stakes = stakesHint(title);
    const immediate = categoryBase + rel + stakes;

    // Tactical
    const bucket = classifyEventBucket(title);
    const { score: patternScore, signal: patternSignal } = patternHit(title, ctx.signalSummary);
    const priorityTag = userPriorityTagBoost(ev.tags);
    const skip = skipPenaltyFor(bucket, ctx.skipCountsByBucket);
    const follow = followThroughBoost(bucket, ctx.followThroughByBucket);
    const tactical = patternScore + priorityTag - skip + follow;

    // Strategic (gated)
    const strategicGate: 0 | 1 = immediate >= MIN_IMMEDIATE ? 1 : 0;
    const goal = strategicGate ? goalAlignment(bucket, ctx.goals) : 0;
    const strategic = goal;

    const importance =
      tier.immediate * immediate +
      tier.tactical  * tactical +
      tier.strategic * strategic * strategicGate;

    if (immediate < MIN_IMMEDIATE) {
      excluded.push({ eventId: ev.id, title, reason: 'below_min_immediate' });
      continue;
    }

    const startMs = new Date(ev.start_time).getTime();
    if (!isFinite(startMs)) {
      excluded.push({ eventId: ev.id, title, reason: 'bad_start_time' });
      continue;
    }

    ranked.push({
      eventId: ev.id,
      title,
      categoryId: enriched.categoryId,
      bucket,
      role,
      startMs,
      minutesUntilStart: Math.round((startMs - nowMs) / 60_000),
      importance: Math.round(importance * 100) / 100,
      tier,
      components: {
        immediate,
        tactical,
        strategic,
        strategicGate,
        breakdown: {
          categoryBase,
          relationship: rel,
          stakes,
          patternScore,
          priorityTag,
          skipPenalty: skip,
          followThrough: follow,
          goalAlignment: goal,
        },
        patternSignal,
      },
    });
  }

  ranked.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (b.components.tactical !== a.components.tactical) return b.components.tactical - a.components.tactical;
    if (b.components.strategic !== a.components.strategic) return b.components.strategic - a.components.strategic;
    return a.minutesUntilStart - b.minutesUntilStart;
  });

  return { ranked, excluded, tier };
}