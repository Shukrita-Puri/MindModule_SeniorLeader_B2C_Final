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
  if (hits === 1) return 8;
  if (hits === 2) return 12;
  return 15;
}