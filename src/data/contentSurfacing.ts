/**
 * Content surfacing SSOT.
 *
 * A practice is "surfaced" only when the shipped frontend actually shows it to
 * the user (today: the three Recalibrate outcome lists). Backend rows may stay
 * active in `sanctuary_content` for future features, but nothing that has no
 * frontend home is allowed into the Mastery Plan.
 *
 * Two things live here, both single-source:
 *   1. SURFACED_CONTENT_IDS / isSurfacedContent — plan eligibility.
 *   2. getDisplayTitle — the one name shown on the Recalibrate list, the plan
 *      slot, the practice detail page and the card-deck overview card.
 */
import { getAllContent, getContentById } from '@/data/practicesAndSoundscapes';

/**
 * Catalogue ids that exist but are deliberately hidden from every Recalibrate
 * list. They have no frontend home, so the plan must never select them.
 */
export const HIDDEN_CONTENT_IDS: readonly string[] = [
  'grounding-touch',
  'pranayama-clarity',
];

/** Every content id the user can actually reach in the shipped frontend. */
export const SURFACED_CONTENT_IDS: readonly string[] = getAllContent()
  .map((c) => c.id)
  .filter((id) => !HIDDEN_CONTENT_IDS.includes(id));

export const isSurfacedContent = (id: string | undefined | null): boolean =>
  !!id && SURFACED_CONTENT_IDS.includes(id);

/**
 * Canonical display titles. Where the Recalibrate list historically renamed a
 * practice, that user-facing name wins and is applied everywhere.
 */
export const DISPLAY_TITLE_OVERRIDES: Record<string, string> = {
  'deep-focus-monastic-resonance': 'Sustained Focus with Monastic Chant',
  'sustained-focus-choir-harmonic': 'Grounding Focus with Cathedral Choir',
  'ina-night-fields': "Nature's Rhythm for Stillness",
  'buddhist-phoenix': 'Resilience Through The Phoenix Approach',
  'stoic-reflection': 'Stoic Evening Clarity & Reflection',
};

/**
 * The one display name for a piece of content. Falls back to the catalogue
 * title, then to any title the caller already has (plan-native items such as
 * the evening reflection slot are not in the catalogue).
 */
export function getDisplayTitle(
  id: string | undefined | null,
  fallbackTitle?: string,
): string {
  if (id && DISPLAY_TITLE_OVERRIDES[id]) return DISPLAY_TITLE_OVERRIDES[id];
  const item = id ? getContentById(id) : undefined;
  return item?.title || fallbackTitle || '';
}
