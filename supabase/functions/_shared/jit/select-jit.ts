// JIT v2 — single triangulated selector. Replaces the legacy scorer +
// jit-candidates ranker after shadow week. See `.lovable/plan.md` for
// the contract. This file is the ONLY place where Immediate / Tactical
// / Strategic combine into an `importance` score.

import { enrichEvent } from '../events/enrich-event.ts';
import type { EventCategoryId } from '../events/event-categories.ts';
import { isPersonalNoise } from './noise-filters.ts';
import {
  weightedDominantRole,
  type AttendeeRoleSignal,
  type ResolvedRole,
} from './relationship-weights.ts';
import {
  classifyEventBucket,
  patternHit,
  userPriorityTagBoost,
  skipPenaltyFor,
  followThroughBoost,
  sovereignTagAdjustment,
  type PatternSignal,
} from './tactical-signals.ts';
import { goalAlignment, applyProtectGoalMultiplier, type UserGoals } from './goal-alignment.ts';
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

/**
 * Interview events are inherently high-stakes for the user: external,
 * evaluative, low-frequency. Add a flat +15 to Immediate when the title
 * advertises an interview AND there is at least one attendee (so a
 * solo "interview prep" block doesn't get the boost).
 */
function interviewBoost(title: string, attendeesCount: number | undefined): number {
  if ((attendeesCount ?? 0) < 1) return 0;
  return /\binterviews?\b/i.test(title) ? 15 : 0;
}

/**
 * Personal-block detector. Titles like "Chief AI Thursday connects",
 * "Daily sync", "1:1", "Standup", "Catchup" with **zero attendees** are
 * almost always solo focus blocks the user named like a meeting — they
 * should not collect recurring-pattern tactical bonus that would lift
 * them above real stakeholder events.
 */
const PERSONAL_BLOCK_RE = /\b(connects?|sync|standups?|catch[- ]?ups?|check[- ]?ins?|1:1|one[- ]on[- ]one|focus|deep[- ]?work)\b/i;
function isPersonalBlock(title: string, attendeesCount: number | undefined): boolean {
  return (attendeesCount ?? 0) === 0 && PERSONAL_BLOCK_RE.test(title);
}

/** Provisional — revisit after shadow week with real distribution. */
export const MIN_IMMEDIATE = 25;

export interface SelectInputEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  /**
   * Number of attendees on the calendar event. Used to gate the
   * interview boost and to detect zero-attendee "personal blocks"
   * that should not collect stakeholder-pattern bonuses.
   */
  attendeesCount?: number;
  /**
   * Resolved roles for known attendees. Accepts either the legacy
   * `ResolvedRole[]` form (treated as `llm` source, full confidence) or
   * the richer `AttendeeRoleSignal[]` with source + confidence so
   * domain-heuristic fallbacks and memory replays can be discounted.
   */
  attendeeRoles?: ResolvedRole[] | AttendeeRoleSignal[];
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
    sovereignBonus: number;
    breakdown: {
      categoryBase: number;
      relationship: number;
      stakes: number;
      patternScore: number;
      priorityTag: number;
      skipPenalty: number;
      followThrough: number;
      goalAlignment: number;
      protectGoalMultiplier: number;
      /** True when the user hasn't tagged AND relationship ≥ 15. */
      relationshipLeads: boolean;
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

    // Immediate — normalize attendee role inputs into AttendeeRoleSignal[]
    // so confidence/source flow through. Legacy `ResolvedRole[]` callers
    // (and the existing test suite) get full base weight.
    const rawRoles = ev.attendeeRoles ?? [];
    const signals: AttendeeRoleSignal[] = (rawRoles as Array<ResolvedRole | AttendeeRoleSignal>).map((r) =>
      typeof r === 'string'
        ? { role: r, source: 'llm' as const, confidence: 1 }
        : r,
    );
    const { signal: dom, weight: rel } = signals.length
      ? weightedDominantRole(signals)
      : { signal: { role: 'unknown' as ResolvedRole, source: 'llm' as const, confidence: null }, weight: 0 };
    const role = dom.role;
    const rawCategoryBase = CATEGORY_BASE[enriched.categoryId];
    const protectMul = applyProtectGoalMultiplier(enriched.categoryId, ctx.goals?.protectGoals);
    const categoryBase = Math.round(rawCategoryBase * protectMul);
    const stakes = stakesHint(title);
    const interview = interviewBoost(title, ev.attendeesCount);
    const immediate = categoryBase + rel + stakes + interview;

    // Tactical
    const bucket = classifyEventBucket(title);
    const { score: rawPatternScore, signal: patternSignal } = patternHit(title, ctx.signalSummary);
    // Personal blocks (zero-attendee titles like "Chief AI Thursday connects",
    // "Daily sync") must not borrow recurring-pattern bonus from real
    // stakeholder events of the same surface category.
    const patternScore = isPersonalBlock(title, ev.attendeesCount) ? 0 : rawPatternScore;
    const priorityTag = userPriorityTagBoost(ev.tags);
    const skip = skipPenaltyFor(bucket, ctx.skipCountsByBucket);
    const follow = followThroughBoost(bucket, ctx.followThroughByBucket);
    const tactical = patternScore + priorityTag - skip + follow;

    // Strategic (gated)
    const strategicGate: 0 | 1 = immediate >= MIN_IMMEDIATE ? 1 : 0;
    const goal = strategicGate ? goalAlignment(bucket, ctx.goals) : 0;
    const strategic = goal;

    // Sovereign user-tag layer — sits OUTSIDE the weighted sum so a
    // user-declared `low` tag demotes regardless of tier totals, and a
    // `high` tag dominates even at T3 weights.
    const sovereign = sovereignTagAdjustment(ev.tags);

    const tierWeighted =
      tier.immediate * immediate +
      tier.tactical  * tactical +
      tier.strategic * strategic * strategicGate;
    const importance = tierWeighted + sovereign.bonus;

    if (sovereign.demote) {
      excluded.push({ eventId: ev.id, title, reason: 'user_tag_low' });
      continue;
    }

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
        sovereignBonus: sovereign.bonus,
        breakdown: {
          categoryBase,
          relationship: rel,
          stakes: stakes + interview,
          patternScore,
          priorityTag,
          skipPenalty: skip,
          followThrough: follow,
          goalAlignment: goal,
          protectGoalMultiplier: protectMul,
          relationshipLeads: (!ev.tags || ev.tags.length === 0) && rel >= 15,
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