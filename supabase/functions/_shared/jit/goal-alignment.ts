// JIT v2 — Strategic boost. Onboarding growth_intention, practice
// priority tags, and coach growth_area are weighted as a self-declared
// growth lane. Pure tiebreaker — gated by Immediate ≥ MIN_IMMEDIATE
// inside select-jit.

export interface UserGoals {
  /** Onboarding free-text growth intentions, lowercased keyword set. */
  growthIntentions?: string[];
  /** Practice priority tags from onboarding (e.g. ['focus', 'composure']). */
  practicePriorityTags?: string[];
  /** Coach-derived growth area labels. */
  coachGrowthAreas?: string[];
  /**
   * Onboarding "protect_goals" — categories the user has explicitly
   * said they want to protect (e.g. 'A' = Board / governance). Used by
   * the Onboarding multiplier inside Immediate (categoryBase *= 1.3).
   */
  protectGoals?: string[];
}

/**
 * Map onboarding protect-goal keywords → EventCategoryId. Categories
 * mirror `_shared/events/event-categories.ts` (A..H).
 */
const PROTECT_GOAL_TO_CATEGORY: Record<string, string[]> = {
  board:        ['A'],
  governance:   ['A'],
  investor:     ['A', 'C'],
  fundraise:    ['A', 'C'],
  client:       ['C'],
  customer:     ['C'],
  deep_work:    ['F'],
  focus:        ['F'],
  one_on_ones:  ['D'],
  reviews:      ['D'],
  team:         ['D'],
  all_hands:    ['G'],
  leadership:   ['G'],
};

/**
 * Returns the Immediate-axis multiplier for `categoryBase` based on
 * the user's onboarding protect_goals. 1.0 = no boost, 1.3 = matched.
 */
export function applyProtectGoalMultiplier(categoryId: string | null | undefined, protectGoals: string[] | null | undefined): number {
  if (!categoryId || !Array.isArray(protectGoals) || protectGoals.length === 0) return 1.0;
  for (const raw of protectGoals) {
    if (!raw) continue;
    const key = String(raw).toLowerCase().trim().replace(/[\s-]+/g, '_');
    const cats = PROTECT_GOAL_TO_CATEGORY[key];
    if (cats && cats.includes(categoryId)) return 1.3;
  }
  return 1.0;
}

// Map onboarding/coach keywords → event-type families they amplify.
const GOAL_TO_BUCKETS: Record<string, string[]> = {
  composure:        ['Board / governance', 'All-hands', 'Investor calls'],
  presence:         ['All-hands', 'Investor calls', 'Client meetings'],
  influence:        ['Investor calls', 'Client meetings', 'Board / governance'],
  difficult_convos: ['1:1s', 'Reviews', 'Interviews'],
  focus:            ['Deep work blocks'],
  recovery:         [],
  resilience:       ['Board / governance', 'Investor calls'],
  decisions:        ['Board / governance', 'Reviews'],
};

function normaliseTag(t: string): string {
  const k = t.toLowerCase().trim();
  if (k.includes('compos')) return 'composure';
  if (k.includes('presen')) return 'presence';
  if (k.includes('influ') || k.includes('persua')) return 'influence';
  if (k.includes('diffic') || k.includes('conflict') || k.includes('feedback')) return 'difficult_convos';
  if (k.includes('focus') || k.includes('deep')) return 'focus';
  if (k.includes('recov')) return 'recovery';
  if (k.includes('resil')) return 'resilience';
  if (k.includes('decid') || k.includes('decision')) return 'decisions';
  return k;
}

/** 0..15 — only added by select-jit when strategicGate=1. */
export function goalAlignment(eventBucket: string | null, goals: UserGoals | null | undefined): number {
  if (!eventBucket || !goals) return 0;
  const tags = [
    ...(goals.growthIntentions ?? []),
    ...(goals.practicePriorityTags ?? []),
    ...(goals.coachGrowthAreas ?? []),
  ].map(normaliseTag);
  if (tags.length === 0) return 0;

  let hits = 0;
  for (const tag of tags) {
    const buckets = GOAL_TO_BUCKETS[tag];
    if (buckets && buckets.includes(eventBucket)) hits += 1;
  }
  if (hits === 0) return 0;
  const score = hits === 1 ? 8 : hits === 2 ? 12 : 15;
  // Phase 3 — diagnostic trace only. Fires only when the goal alignment
  // actually contributes (hits > 0). Behaviour unchanged.
  try {
    console.info('[plan][goal-alignment]', {
      eventBucket,
      tags,
      hits,
      score,
      growthIntentions: goals.growthIntentions ?? [],
      practicePriorityTags: goals.practicePriorityTags ?? [],
      coachGrowthAreas: goals.coachGrowthAreas ?? [],
    });
  } catch { /* logging must never break scoring */ }
  return score;
}