// Frontend MIRROR of the canonical A–H pillar names.
//
// The single source of truth is
// `supabase/functions/_shared/events/event-categories.ts` (backend). The
// browser bundle cannot import Deno edge code, so this file mirrors just the
// id → display-name map. `src/lib/events/__tests__/categories.test.ts` reads
// the backend file and fails the build if the two ever drift.
//
// Never hardcode an A–H label in a component — import from here.

export type EventCategoryId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const EVENT_CATEGORY_NAMES: Record<EventCategoryId, string> = {
  A: 'Board & Governance',
  B: 'Influence & Persuasion',
  C: 'Visibility & Communication',
  D: 'Interpersonal & High-Stakes',
  E: 'Deep Work & Strategy',
  F: 'Conferences & External Events',
  G: 'Travel',
  H: 'Daily Rhythm & Baseline',
};

export const EVENT_CATEGORY_ORDER: EventCategoryId[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
];

export const CANONICAL_CATEGORY_LABELS: string[] =
  EVENT_CATEGORY_ORDER.map((id) => EVENT_CATEGORY_NAMES[id]);

export function isCanonicalCategoryLabel(label: string | null | undefined): boolean {
  return !!label && CANONICAL_CATEGORY_LABELS.includes(label);
}
