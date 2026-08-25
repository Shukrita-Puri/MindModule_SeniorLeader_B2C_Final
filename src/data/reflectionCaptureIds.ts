/**
 * Reflection capture SSOT.
 *
 * Explicit allowlist of card decks whose steps are written prompts and must
 * therefore show the inline response box (stored in `practice_reflections`).
 *
 * Somatic / breath decks are deliberately excluded: there is nothing to write.
 */

export const REFLECTION_CAPTURE_IDS: readonly string[] = [
  // Mindset / reframe decks
  'stoic-reflection',
  'eye-of-storm',
  'presence-grounding',
  'presence-grounding-new',
  'stillness-gap',
  'stillness-gap-new',
  'detachment-observer',
  'detachment-observer-new',
  'softness-release',
  'softness-release-new',
  'mushin-no-mind',
  'ikigai-purpose',
  'buddhist-phoenix',
  'energy-through-reframe',
  'courage-future-self',
  'confidence-through-evidence',
  'energy-through-completion',
  'courage-arena',
  'single-thread-focus',
  'first-move-momentum',
  'depth-subtraction',
  'eternal-now-presence',
  'rhythm-pulse',
  'mastery-constraint',
  // Reframe deck previously mis-tagged as a tool — every step is a writing prompt
  'jobs-simplicity',
];

/** Decks treated as somatic / breath: never show a writing box. */
export const SOMATIC_NO_CAPTURE_IDS: readonly string[] = [
  'wu-wei-flow',
  'fudoshin-immovable-mind',
  'grounding-touch',
  'release-exhale',
  'release-exhale-new',
  'djokovic-reset',
];

export const capturesReflection = (id: string | undefined | null): boolean =>
  !!id && REFLECTION_CAPTURE_IDS.includes(id);
