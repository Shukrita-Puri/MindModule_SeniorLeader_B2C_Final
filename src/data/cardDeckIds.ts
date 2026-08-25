/**
 * Content ids that have a card deck in MicroPracticePlayerCards.
 * Kept as a light-weight list so routing code does not have to import the
 * (very large) deck module. `hasCardDeck` in MicroPracticePlayerCards is the
 * runtime source; a unit test asserts the two stay in sync.
 */
export const CARD_DECK_IDS: readonly string[] = [
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
  'wu-wei-flow',
  'mushin-no-mind',
  'jobs-simplicity',
  'ikigai-purpose',
  'stoic-reflection',
  'fudoshin-immovable-mind',
  'presence-grounding',
  'presence-grounding-new',
  'release-exhale',
  'release-exhale-new',
  'eye-of-storm',
  'stillness-gap',
  'stillness-gap-new',
  'detachment-observer',
  'detachment-observer-new',
  'softness-release',
  'softness-release-new',
];

export const hasCardDeckId = (id: string | undefined | null): boolean =>
  !!id && CARD_DECK_IDS.includes(id);

/** Route a piece of content to the page that already exists for it. */
export const routeForContent = (
  contentId: string | undefined | null,
  contentType: string | undefined | null,
): string => {
  if (contentType === 'soundbath') return `/soundscapes/${contentId}`;
  if (contentType === 'guided-practice') return `/guided-practices/${contentId}`;
  return hasCardDeckId(contentId)
    ? `/micro-practice/${contentId}/cards`
    : `/micro-practice/${contentId}`;
};
