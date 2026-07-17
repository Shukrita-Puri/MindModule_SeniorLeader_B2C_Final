// Phase B — ranked (event, phase) JIT candidate generator.
//
// Produces one candidate per available phase (pre / during / post) for every
// event in the horizon, scored against §3/§4 of the CEO Self-Regulation
// Framework. The slot resolver still consumes only the top-1 candidate
// today (behaviour-equivalent to the legacy single-event picker); Phase C
// will fan the ranked list into per-(event,phase) slot assignment.
//
// Lives in `_shared/events` so tests can import it without pulling in the
// `generate-mastery-plan` module.

import type { ComboKey } from '../protocols/protocol-combos.ts';
import type { EventCategoryId } from './event-categories.ts';
import { enrichEvent } from './enrich-event.ts';
import type { Phase } from './event-phase-map.ts';
import type { DemandProfile } from './event-subtypes.ts';

export interface RankableEventInput {
  event: { id?: string; title?: string | null; start_time: string; end_time?: string | null };
  stakesLevel?: string | null;
  score?: number | null;
  /** Optional pre-computed skip penalty from upstream `jit_cancellation_memory`. */
  skipPenalty?: number | null;
  /**
   * Optional learning-loop delta from `applyEventPriorityMemory` (Week-Ahead
   * picker + weekday Plan memory). Already clamped to [-50, +30] by the helper.
   */
  memoryDelta?: number | null;
  /**
   * When true, the event has been hard-demoted by user memory ('never'
   * signal) — `rankJitCandidates` will skip emitting any candidates for it.
   */
  memoryHardDemote?: boolean | null;
}

export interface RankedJitCandidate {
  eventId: string;
  title: string;
  phase: Phase;
  categoryId: EventCategoryId;
  comboKey: ComboKey;
  severity: 'high' | 'medium' | 'low';
  leadTimeMin: number | null;
  demandProfile: DemandProfile | null;
  /** Absolute window the candidate is firing-eligible inside (ms). */
  windowStartMs: number;
  windowEndMs: number;
  /** True when `nowMs` is within `[windowStartMs, windowEndMs]`. */
  eligible: boolean;
  /** Minutes until the firing window opens (negative = inside, positive = ahead). */
  minutesUntilWindow: number;
  score: number;
  components: {
    base: number;
    category: number;
    severity: number;
    demand: number;
    proximity: number;
    skipPenalty: number;
    memory: number;
  };
}

// ----- scoring weights -----

const STAKES_BASE: Record<string, number> = {
  board: 40, external: 35, investor: 35,
  critical: 30, high: 22, medium: 12, low: 4,
};

const CATEGORY_WEIGHT: Record<EventCategoryId, number> = {
  A: 20, B: 10, C: 15, D: 15, E: 5, F: 10, G: 5, H: 0,
};

const SEVERITY_WEIGHT = { high: 15, medium: 8, low: 3 } as const;
const MAX_JIT_HORIZON_MS = 24 * 60 * 60_000;
const STALE_PHASE_GRACE_MS: Record<Phase, number> = {
  pre: 30 * 60_000,
  during: 30 * 60_000,
  post: 2 * 60 * 60_000,
};

function demandWeight(phase: Phase, d: DemandProfile | null): number {
  if (!d) return 0;
  if (phase === 'pre')    return (d.cog + d.emo) * 2;   // max 12
  if (phase === 'during') return d.cog * 3;             // max 9
  /* post */              return (d.ene + d.cir) * 3;   // max 18
}

// Parse phase.timing strings like "T-60 to T-15min", "T-2h", "T+30min",
// "T+30 to T+90min", "in-room", "on arrival", "in-window".
// Returns offsets in minutes RELATIVE to the phase anchor (start for pre/during,
// end for post).
function parseTiming(timing: string): { fromMin: number; toMin: number } {
  const t = timing.trim().toLowerCase();
  if (t.includes('in-room') || t.includes('in-window')) return { fromMin: 0, toMin: 0 };
  if (t.includes('on arrival')) return { fromMin: 0, toMin: 60 };
  // Matches signed offsets with optional unit ("60min", "2h", "15").
  const re = /t\s*([+-])\s*(\d+(?:\.\d+)?)\s*(h|hr|hour|hrs|m|min|mins|minute|minutes)?/g;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const sign = m[1] === '-' ? -1 : 1;
    const val = parseFloat(m[2]);
    const unit = (m[3] || 'min').toLowerCase();
    const mins = unit.startsWith('h') ? val * 60 : val;
    nums.push(sign * mins);
  }
  if (nums.length === 0) return { fromMin: 0, toMin: 0 };
  if (nums.length === 1) {
    const a = nums[0];
    // single-anchor timing: open 30min before/after the anchor for a usable window
    return a < 0 ? { fromMin: a, toMin: 0 } : { fromMin: a, toMin: a + 30 };
  }
  return { fromMin: Math.min(nums[0], nums[1]), toMin: Math.max(nums[0], nums[1]) };
}

function proximityScore(nowMs: number, windowStartMs: number, windowEndMs: number): number {
  // JIT v2 rework: proximity is a tiebreaker only — clamped to ±5 so
  // it cannot overpower core (stakes/category/severity/demand/memory).
  const raw = computeRawProximity(nowMs, windowStartMs, windowEndMs);
  if (raw > 5) return 5;
  if (raw < -5) return -5;
  return raw;
}

function computeRawProximity(nowMs: number, windowStartMs: number, windowEndMs: number): number {
  if (nowMs >= windowStartMs && nowMs <= windowEndMs) {
    const span = Math.max(1, windowEndMs - windowStartMs);
    const mid = (windowStartMs + windowEndMs) / 2;
    const dist = Math.abs(nowMs - mid);
    return 10 * (1 - dist / (span / 2 + 1)); // peak at midpoint, ~0 at edge
  }
  if (nowMs < windowStartMs) {
    const aheadMin = (windowStartMs - nowMs) / 60_000;
    // fade-in: 8 at <30min ahead, 4 at 6h, 0 by 24h
    if (aheadMin <= 30) return 8;
    if (aheadMin <= 360) return 6;
    if (aheadMin <= 1440) return 3;
    return 0;
  }
  // past window: penalise lightly so missed phases drop below upcoming ones
  return -5;
}

export function rankJitCandidates(
  events: RankableEventInput[],
  nowMs: number,
): RankedJitCandidate[] {
  const out: RankedJitCandidate[] = [];
  const dropped: Array<{ title: string; categoryId: string; phase: string; score: number; reason: string }> = [];
  for (const ev of events) {
    if (ev.memoryHardDemote) continue;
    const startMs = new Date(ev.event.start_time).getTime();
    if (!isFinite(startMs)) continue;
    const endMs = ev.event.end_time ? new Date(ev.event.end_time).getTime() : startMs + 60 * 60_000;
    const enriched = enrichEvent({ title: ev.event.title || '' });
    if (!enriched.categoryId) continue;
    const base = STAKES_BASE[(ev.stakesLevel || '').toLowerCase()] ?? 5;
    const catW = CATEGORY_WEIGHT[enriched.categoryId];
    const skipPenalty = ev.skipPenalty ?? 0;
    const memory = ev.memoryDelta ?? 0;

    for (const phase of ['pre', 'during', 'post'] as const) {
      const ph = enriched.phases[phase];
      if (!ph) continue;
      const anchorMs = phase === 'post' ? endMs : startMs;
      const { fromMin, toMin } = parseTiming(ph.timing);
      // pre: anchor = start, fromMin negative; window before start.
      // during: window between start and end.
      // post: anchor = end, fromMin positive; window after end.
      const winStart = phase === 'during' ? startMs : anchorMs + fromMin * 60_000;
      const winEnd   = phase === 'during' ? endMs   : anchorMs + toMin   * 60_000;
      if (winStart - nowMs > MAX_JIT_HORIZON_MS) continue;
      if (winEnd < nowMs - STALE_PHASE_GRACE_MS[phase]) continue;
      const severity = (ph.severityHint || 'medium') as 'high'|'medium'|'low';
      const sevW = SEVERITY_WEIGHT[severity];
      const demW = demandWeight(phase, enriched.demandProfile);
      const prox = proximityScore(nowMs, winStart, winEnd);
      const score = base + catW + sevW + demW + prox - skipPenalty + memory;
      const candidate: RankedJitCandidate = {
        eventId: ev.event.id || '',
        title: ev.event.title || '',
        phase,
        categoryId: enriched.categoryId,
        comboKey: ph.combo,
        severity,
        leadTimeMin: enriched.leadTimeMin ?? (Math.abs(fromMin) || null),
        demandProfile: enriched.demandProfile,
        windowStartMs: winStart,
        windowEndMs: winEnd,
        eligible: nowMs >= winStart && nowMs <= winEnd,
        minutesUntilWindow: Math.round((winStart - nowMs) / 60_000),
        score: Math.round(score * 10) / 10,
        components: {
          base,
          category: catW,
          severity: sevW,
          demand: demW,
          proximity: Math.round(prox * 10) / 10,
          skipPenalty,
          memory,
        },
      };
      // Sprint 3 (Phase 5): drop weak/low-stakes candidates so one weak
      // classifier hit cannot anchor a Plan slot (or worse, be recycled
      // across all three).
      const dropReason = getJitCandidateDropReason(candidate, ev);
      if (dropReason) {
        dropped.push({
          title: candidate.title,
          categoryId: String(candidate.categoryId),
          phase: candidate.phase,
          score: candidate.score,
          reason: dropReason,
        });
        continue;
      }
      out.push(candidate);
    }
  }
  out.sort((a, b) => b.score - a.score);
  if (dropped.length > 0) {
    try {
      // Keep the log compact — only the top 10 drops per call.
      console.info('[rankJitCandidates][filtered-low-stakes]', {
        droppedCount: dropped.length,
        keptCount: out.length,
        dropped: dropped.slice(0, 10),
      });
    } catch { /* logging must never break ranking */ }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// Sprint 3 (Phase 5) — meaningful-candidate floor
//
// Weak, low-stakes classifier hits ("Liquid Fast", "personal errand",
// weakly-matched routine items) were entering ranked candidates and, via
// `allocatePlanSlots`' `second ?? top` fallback, being repeated across
// all three Plan slots. This floor drops candidates that carry no real
// executive signal.
//
// The rule is a PREDICATE, not just a magic score — a low-scoring but
// genuinely high-stakes short event (e.g. a 10-minute board vote) still
// clears the floor via `hasStrongStakes`.
// ═══════════════════════════════════════════════════════════════════════

/** Absolute floor when the predicate has no strong signals to rely on. */
export const MIN_CANDIDATE_SCORE = 25;

const STRONG_STAKES = new Set(['board', 'external', 'investor', 'critical', 'high']);
// Structural pillars per event-categories.ts:
//   A = High-Stakes Governance
//   C = Visibility & Communication
//   F = Conferences & External Events
//   G = Travel
// These are the day-shape drivers referenced by slot-allocator.ts's
// topIsStructural check. D (People / Difficult Conversations) is NOT a
// structural pillar — it must clear the floor via explicit stakes,
// severity, demand or memory signal like any other interpersonal item.
const STRUCTURAL_CATEGORIES = new Set(['A', 'C', 'F', 'G']);
const PERSONAL_CATEGORY = 'H';
const ADMIN_COMPLIANCE_NOISE_KEYWORDS = [
  'r&d tax',
  'r & d tax',
  'tax claim',
  'vat',
  'compliance review',
  'legal admin',
  'procurement review',
  'finance ops',
  'audit prep',
  'hr admin',
  'payroll',
  'expense review',
  'invoice',
  'regulatory filing',
];

/**
 * Returns a short string reason if the candidate should be dropped, or
 * `null` if it is meaningful enough to enter the ranked list.
 */
export function getJitCandidateDropReason(
  c: RankedJitCandidate,
  ev: RankableEventInput,
): string | null {
  const stakes = String(ev.stakesLevel || '').toLowerCase();
  const hasStrongStakes = STRONG_STAKES.has(stakes);
  const hasMediumStakes = stakes === 'medium';
  const hasStrongSeverity = c.severity === 'high';
  const hasStrongDemand = (c.components?.demand ?? 0) >= 8;
  const hasPositiveMemory = (c.components?.memory ?? 0) >= 10;
  const isStructural = STRUCTURAL_CATEGORIES.has(String(c.categoryId));
  const isPersonal = String(c.categoryId) === PERSONAL_CATEGORY;

  // Explicit strong signals are always enough on their own.
  if (hasStrongStakes) return null;
  if (hasPositiveMemory) return null;

  const titleLower = String(c.title || '').toLowerCase();
  if (ADMIN_COMPLIANCE_NOISE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
    return 'admin_compliance_noise';
  }

  // Personal-category items must have an explicit user/stakes signal —
  // routine personal errands should never anchor an executive Plan slot.
  if (isPersonal) return 'personal_category_without_explicit_stakes';

  // Structural categories keep any candidate carrying at least one real
  // signal (stakes-medium, severity-high, or a real demand profile).
  if (isStructural) {
    if (hasMediumStakes || hasStrongSeverity || hasStrongDemand) return null;
    // Otherwise fall through to the numeric floor — structural events with
    // literally no metadata still deserve consideration if the raw score
    // is high enough (proximity, category weight).
  } else {
    // Non-structural (B, D, E, H, ...): require at least two secondary
    // signals OR a clear numeric floor. G (Travel) is structural — see
    // STRUCTURAL_CATEGORIES above — and is handled in the branch above.
    const secondarySignals = [hasMediumStakes, hasStrongSeverity, hasStrongDemand].filter(Boolean).length;
    if (secondarySignals >= 2) return null;
  }

  if (c.score >= MIN_CANDIDATE_SCORE) return null;

  return 'below_meaningful_floor';
}

/** Inverse of `getJitCandidateDropReason` — convenience for tests / callers. */
export function isMeaningfulJitCandidate(
  c: RankedJitCandidate,
  ev: RankableEventInput,
): boolean {
  return getJitCandidateDropReason(c, ev) === null;
}
