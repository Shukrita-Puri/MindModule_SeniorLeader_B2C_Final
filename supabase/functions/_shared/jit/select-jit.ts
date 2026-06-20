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
import { RELATIONSHIP_WEIGHT } from './relationship-weights.ts';
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

/**
 * §3 framework category base — stakes-based ladder (irreversibility +
 * visibility + consequence), not cognitive intensity. See `.lovable/plan.md`.
 */
const CATEGORY_BASE: Record<EventCategoryId, number> = {
  A: 40, // Governance: board, investor, M&A, earnings
  C: 32, // Visibility: all-hands, media, keynote, panel
  B: 30, // Influence: pitch, negotiation, close (CEO-critical)
  D: 22, // People & difficult conversations (1:1 base)
  F: 18, // Conferences (multi-day, reschedulable per slot)
  G: 12, // Travel (preparation window, not a performance moment)
  E: 10, // Deep work (cognitively heavy, low external stakes)
  H: 5,  // Daily rhythm / baseline
};

/** Cap on D after `interpersonalStakesBoost` so it can't stack past A. */
const D_BOOSTED_CAP = 38;

const STAKES_KEYWORDS: Array<{ pts: number; words: string[] }> = [
  // A-tier governance/visibility/legal/regulatory
  { pts: 15, words: [
    'board', 'investor', 'fundraise', 'm&a', 'ipo',
    'earnings', 'quarterly results', 'guidance',
    'deposition', 'testimony', 'regulator', 'sec ', 'ftc ', 'doj ', 'court hearing',
  ] },
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

/* ─────────────────────────────────────────────────────────────────────
 * §2 — high-stakes interpersonal sub-bonus inside category D.
 * Layoff, restructure, termination, PIP, written-up performance review,
 * difficult/escalation/conflict all push D from base 22 to ~35.
 * Fires only when categoryId === 'D'. Capped at D_BOOSTED_CAP.
 * ─────────────────────────────────────────────────────────────────── */
const INTERPERSONAL_HIGH_STAKES_RE =
  /\b(layoff|restructure|termination|terminate|pip\b|performance\s+review.*(giving|deliver|delivering)|difficult|escalation|conflict|critical\s+negotiation)/i;
function interpersonalStakesBoost(title: string, categoryId: EventCategoryId): number {
  if (categoryId !== 'D') return 0;
  return INTERPERSONAL_HIGH_STAKES_RE.test(title) ? 13 : 0;
}

/* ─────────────────────────────────────────────────────────────────────
 * §3 — interview boost split into 4 buckets:
 *   media (broadcast) → +15
 *   user-as-candidate → +18
 *   hiring (panel side) → +6
 *   bare/ambiguous → +8
 * ─────────────────────────────────────────────────────────────────── */
const MEDIA_INTERVIEW_RE =
  /\b(media|press|podcast|cnbc|bloomberg|bbc|\bft\b|wsj|reuters|techcrunch)\b.*interview|interview.*\b(media|press|podcast|cnbc|bloomberg|bbc|wsj)\b/i;
const HIRING_KEYWORD_RE = /\b(candidate|hire|hiring|panel\s+interview|loop|interview\s*:?\s*\w+\s+for\s+)/i;
const MY_INTERVIEW_TITLE_RE =
  /\b(my\s+interview\s+at|interview\s+with\s+.*(ceo|founder|chair|managing\s+partner|general\s+partner))/i;
const INTERVIEW_RE = /\binterviews?\b/i;

export type InterviewKind = 'media' | 'candidate' | 'hiring' | 'ambiguous' | 'none';

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase().trim();
}

export function classifyInterview(args: {
  title: string;
  attendeesCount: number;
  subtypeId?: string | null;
  categoryId?: EventCategoryId | null;
  organizerEmail?: string | null;
  attendeeDomains?: string[];
  userDomain?: string | null;
  tags?: string[];
}): InterviewKind {
  const { title } = args;
  if (!INTERVIEW_RE.test(title)) return 'none';
  if ((args.attendeesCount ?? 0) < 2) return 'none';

  // Media — broadcast/reputational. Highest-confidence first.
  if (
    args.subtypeId === 'media-publication' ||
    args.categoryId === 'C' ||
    MEDIA_INTERVIEW_RE.test(title)
  ) {
    return 'media';
  }

  const tagsNorm = (args.tags ?? []).map((t) => String(t).toLowerCase().trim());
  // Sovereign tag — definitive.
  if (tagsNorm.includes('my-interview') || tagsNorm.includes('candidate')) return 'candidate';

  // Title preposition signal — "my interview at X" / "interview with <senior>"
  if (MY_INTERVIEW_TITLE_RE.test(title)) return 'candidate';

  // Direction-of-evaluation: organizer + attendee-domain majority.
  const own = (args.userDomain ?? '').toLowerCase().trim();
  const orgDom = domainOf(args.organizerEmail);
  const att = (args.attendeeDomains ?? [])
    .map((d) => (d ?? '').toLowerCase().trim())
    .filter(Boolean);

  if (own) {
    if (orgDom && orgDom !== own) {
      // External organizer running an interview → user is candidate.
      return 'candidate';
    }
    if (att.length >= 2) {
      const external = att.filter((d) => d !== own).length;
      if (external * 2 > att.length) return 'candidate';
      if (external === 0) return 'hiring';
    }
  }

  // Hiring keyword signals (panel side).
  if (HIRING_KEYWORD_RE.test(title)) return 'hiring';

  // Hiring loop subtype.
  if (args.subtypeId === 'hiring-loop') return 'hiring';

  return 'ambiguous';
}

function interviewBoost(kind: InterviewKind): number {
  switch (kind) {
    case 'candidate': return 18;
    case 'media':     return 15;
    case 'ambiguous': return 8;
    case 'hiring':    return 6;
    default:          return 0;
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * §4 — 1:1 seniority differentiation. Only fires when categoryId === 'D'
 * AND attendeesCount === 1. Boss/board lifts; report drops below MIN.
 * `unknown` = no penalty so the LinkedIn resolver can fill in later.
 * ─────────────────────────────────────────────────────────────────── */
function oneOnOneSeniorityAdjust(
  categoryId: EventCategoryId,
  role: ResolvedRole,
  attendeesCount: number | undefined,
): number {
  if (categoryId !== 'D' || (attendeesCount ?? 0) !== 1) return 0;
  switch (role) {
    case 'boss':
    case 'board_member': return 10;
    case 'investor':
    case 'client':       return 8;
    case 'peer':         return 0;
    case 'report':       return -6;
    default:             return 0;
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * §5 — Crisis / unplanned escalation routed to Smart Nudge, NOT Plan.
 * ─────────────────────────────────────────────────────────────────── */
const CRISIS_TITLE_RE =
  /\b(urgent|crisis|emergency|escalation|incident|sev[- ]?[012]\b|p[012]\b|war[ -]?room|all hands now|outage|breach|critical)\b/i;
const CRISIS_SHIFT_RE = /\b(re-?scheduled|moved up|bumped)\b/i;

function isCrisisEvent(args: {
  title: string;
  tags: string[];
  createdAt?: string | null;
  startMs: number;
  nowMs: number;
  categoryId: EventCategoryId | null;
  attendeesCount: number | undefined;
}): { crisis: boolean; reasonDetail?: string } {
  const tags = args.tags.map((t) => String(t).toLowerCase().trim());
  if (tags.includes('crisis') || tags.includes('urgent')) {
    return { crisis: true, reasonDetail: 'sovereign_tag' };
  }
  if (CRISIS_TITLE_RE.test(args.title)) {
    return { crisis: true, reasonDetail: 'title_keyword' };
  }
  const leadMs = args.startMs - args.nowMs;
  const FOUR_HOURS = 4 * 3600_000;
  if (
    args.createdAt &&
    args.categoryId && ['A','B','C','D'].includes(args.categoryId) &&
    (args.attendeesCount ?? 0) >= 2
  ) {
    const createdMs = new Date(args.createdAt).getTime();
    if (isFinite(createdMs) && args.startMs - createdMs < FOUR_HOURS && leadMs > 0) {
      return { crisis: true, reasonDetail: 'short_lead_time' };
    }
  }
  if (CRISIS_SHIFT_RE.test(args.title) && leadMs > 0 && leadMs < FOUR_HOURS) {
    return { crisis: true, reasonDetail: 'title_shift' };
  }
  return { crisis: false };
}

/* ─────────────────────────────────────────────────────────────────────
 * Speaking-at-conference re-route — a keynote/panel/fireside that
 * classifies as F is more accurately a Visibility moment (C).
 * ─────────────────────────────────────────────────────────────────── */
const SPEAKING_RE = /\b(keynote|panel|speaking|fireside)\b/i;
function maybeReRouteSpeakingToC(categoryId: EventCategoryId, title: string): EventCategoryId {
  if (categoryId === 'F' && SPEAKING_RE.test(title)) return 'C';
  return categoryId;
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
  /** Calendar event `created_at` — used for short-lead-time crisis detection. */
  createdAt?: string | null;
  /** Organizer email — used to disambiguate candidate vs hiring-side interview. */
  organizerEmail?: string | null;
  /** Attendee email domains — used to detect external-majority interviews. */
  attendeeDomains?: string[];
  /** User's own work domain — used to compare against attendee/organizer domains. */
  userDomain?: string | null;
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
  /**
   * §11A.6 MemoryDelta — derived-state read keyed by event id. Pure data:
   * the caller in `generate-mastery-plan/index.ts` is responsible for loading
   * from the derived-memory store and passing in. This file performs no I/O.
   *  - `delta`              additive contribution applied AFTER tier weighting
   *  - `hardDemote`         evict outright (mirrors `rankJitCandidates` hard demote)
   *  - `sovereignEscalation` `'low'` → 3× cancelled-as-noise escalation per §9 M3
   */
  memoryDeltaByEventId?: Record<string, { delta?: number; hardDemote?: boolean; sovereignEscalation?: 'low' }>;
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
    /** Hoisted relationship weight from user_tag / memory_user_tag (subset of sovereignBonus). */
    sovereignRelationship: number;
    /** §11A.6 MemoryDelta applied post-tier-weighting. */
    memoryDelta: number;
    breakdown: {
      categoryBase: number;
      relationship: number;
      /** Sub-split of `relationship` — confidence-discounted llm/domain term. */
      relationship_inferred: number;
      /** Sub-split of `relationship` — hoisted user_tag / memory_user_tag term. */
      relationship_sovereign: number;
      stakes: number;
      /** §7 situational (media/hiring) boost split out of combined `stakes`. */
      situationalBoost: number;
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
  /** Crisis-routed events surfaced for Smart Nudge dispatch. */
  crisisEvents: Array<{ eventId: string; title: string; startMs: number; reasonDetail: string }>;
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
  const crisisEvents: SelectResult['crisisEvents'] = [];

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
    // Speaking-at-conference re-route: keynote/panel/fireside categorised as F
    // is more accurately C (visibility).
    const categoryId = maybeReRouteSpeakingToC(enriched.categoryId, title);
    const subtypeId = enriched.subtype?.id ?? null;
    const startMs = new Date(ev.start_time).getTime();
    if (!isFinite(startMs)) {
      excluded.push({ eventId: ev.id, title, reason: 'bad_start_time' });
      continue;
    }
    if (startMs - nowMs > 24 * 60 * 60_000) {
      excluded.push({ eventId: ev.id, title, reason: 'outside_24h_ceiling' });
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
    // §11A.2 / §11A.3 — split attendee signals by source.
    //   sovereign rels (user_tag, memory_user_tag) HOIST out of Immediate
    //   inferred rels (llm, domain_heuristic) stay in Immediate, confidence-discounted
    const sovereignSignals = signals.filter((s) => s.source === 'user_tag' || s.source === 'memory_user_tag');
    const inferredSignals  = signals.filter((s) => s.source === 'llm' || s.source === 'domain_heuristic');
    const sovereignDom = sovereignSignals.length ? weightedDominantRole(sovereignSignals) : null;
    const inferredDom  = inferredSignals.length  ? weightedDominantRole(inferredSignals)  : null;
    // Hoisted weight — RELATIONSHIP_WEIGHT base, no confidence discount, capped at 25.
    const relationship_sovereign = sovereignDom
      ? Math.min(25, RELATIONSHIP_WEIGHT[sovereignDom.signal.role] ?? 0)
      : 0;
    // In-Immediate inferred weight — already confidence-discounted by relationshipWeight().
    const relationship_inferred = inferredDom ? Math.min(25, inferredDom.weight) : 0;
    // Dominant role for downstream consumers — prefer sovereign (user voice wins).
    const role: ResolvedRole = sovereignDom?.signal.role
      ?? inferredDom?.signal.role
      ?? 'unknown';
    const effectiveRel = relationship_inferred + relationship_sovereign;
    let rawCategoryBase = CATEGORY_BASE[categoryId];
    const interpersonalBoost = interpersonalStakesBoost(title, categoryId);
    if (interpersonalBoost > 0) {
      rawCategoryBase = Math.min(D_BOOSTED_CAP, rawCategoryBase + interpersonalBoost);
    }
    const seniorityAdjust = oneOnOneSeniorityAdjust(categoryId, role, ev.attendeesCount);
    rawCategoryBase = rawCategoryBase + seniorityAdjust;
    const protectMul = applyProtectGoalMultiplier(categoryId, ctx.goals?.protectGoals);
    const categoryBase = Math.round(rawCategoryBase * protectMul);
    const stakes = stakesHint(title);
    const interviewKind = classifyInterview({
      title,
      attendeesCount: ev.attendeesCount ?? 0,
      subtypeId,
      categoryId,
      organizerEmail: ev.organizerEmail,
      attendeeDomains: ev.attendeeDomains,
      userDomain: ev.userDomain,
      tags: ev.tags,
    });
    // §7 situationalBoost replaces the flat interview boost in the formula.
    // Gated to attendeesCount ≥ 2 per spec — a 1-attendee "interview" is
    // ambiguous enough that the boost is withheld at the scoring layer
    // (the classifier itself still labels it for observability).
    const situationalBoost = (ev.attendeesCount ?? 0) >= 2 ? interviewBoost(interviewKind) : 0;
    const immediate = categoryBase + relationship_inferred + stakes + situationalBoost;

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
    const sovereignBonus = sovereign.bonus + relationship_sovereign;

    // §11A.6 MemoryDelta — pure read of derived state passed in via ctx.
    const memEntry = ctx.memoryDeltaByEventId?.[ev.id];
    const memoryDelta = memEntry?.delta ?? 0;

    const tierWeighted =
      tier.immediate * immediate +
      tier.tactical  * tactical +
      tier.strategic * strategic * strategicGate;
    // Decision 9 — urgency is NOT added here; it is a final-sort tiebreaker only.
    const importance = tierWeighted + sovereignBonus + memoryDelta;

    if (memEntry?.hardDemote) {
      excluded.push({ eventId: ev.id, title, reason: 'memory_hard_demote' });
      continue;
    }
    if (memEntry?.sovereignEscalation === 'low') {
      excluded.push({ eventId: ev.id, title, reason: 'memory_escalated_low' });
      continue;
    }
    if (sovereign.demote) {
      excluded.push({ eventId: ev.id, title, reason: 'user_tag_low' });
      continue;
    }

    // §11A.1 / Decision 10 — JIT floor: gate on TIER-WEIGHTED total OR
    // (immediate OR tactical) clearing the threshold, never on immediate
    // alone. Sovereign High (≥45) and hoisted top-tier relationship (≥25)
    // bypass the gate. Reason string preserved for back-compat.
    const sovereignBypass = sovereignBonus >= 25;
    const floorPass =
      sovereignBypass ||
      immediate    >= MIN_IMMEDIATE ||
      tactical     >= MIN_IMMEDIATE ||
      tierWeighted >= MIN_IMMEDIATE;
    if (!floorPass) {
      excluded.push({ eventId: ev.id, title, reason: 'below_min_immediate' });
      continue;
    }

    // Crisis gate — late-arriving urgent events route to Smart Nudge, not Plan.
    const crisis = isCrisisEvent({
      title,
      tags: ev.tags ?? [],
      createdAt: ev.createdAt,
      startMs,
      nowMs,
      categoryId,
      attendeesCount: ev.attendeesCount,
    });
    if (crisis.crisis) {
      excluded.push({ eventId: ev.id, title, reason: 'crisis_route_to_nudge' });
      crisisEvents.push({ eventId: ev.id, title, startMs, reasonDetail: crisis.reasonDetail ?? 'unknown' });
      continue;
    }

    ranked.push({
      eventId: ev.id,
      title,
      categoryId,
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
        sovereignBonus,
        sovereignRelationship: relationship_sovereign,
        memoryDelta,
        breakdown: {
          categoryBase,
          // `relationship` reports the EFFECTIVE rel (inferred + sovereign)
          // for back-compat with existing consumers / tests that read this
          // field as "what relationship contributed to the event's worth".
          relationship: effectiveRel,
          relationship_inferred,
          relationship_sovereign,
          // `stakes` reports the combined stakes+situational total for
          // back-compat; split values are also surfaced individually.
          stakes: stakes + situationalBoost,
          situationalBoost,
          patternScore,
          priorityTag,
          skipPenalty: skip,
          followThrough: follow,
          goalAlignment: goal,
          protectGoalMultiplier: protectMul,
          // §11A.3 — flag reads EFFECTIVE rel so hoisted sovereign rels
          // don't silently turn the flag off.
          relationshipLeads: (!ev.tags || ev.tags.length === 0) && effectiveRel >= 15,
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

  return { ranked, excluded, tier, crisisEvents };
}
