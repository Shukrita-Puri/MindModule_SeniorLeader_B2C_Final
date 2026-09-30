// Frontend MIRROR of the canonical A–J pillar names.
//
// The single source of truth is
// `supabase/functions/_shared/events/event-categories.ts` (backend). The
// browser bundle cannot import Deno edge code, so this file mirrors just the
// id → display-name map. `src/lib/events/__tests__/categories.test.ts` reads
// the backend file and fails the build if the two ever drift.
//
// Never hardcode an A–J label in a component — import from here.

export type EventCategoryId =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J';

export const EVENT_CATEGORY_NAMES: Record<EventCategoryId, string> = {
  A: 'Board & Governance',
  B: 'Pitches, Deals & Negotiations',
  C: 'Public Speaking & Media',
  D: 'People & Team Dynamics',
  E: 'Strategic Thinking & Decision Making',
  F: 'Conferences & External Events',
  G: 'Travel',
  H: 'Personal Time & Recovery',
  I: 'Operations & Execution',
  J: 'Crisis, Risk & Incidents',
};

export const EVENT_CATEGORY_ORDER: EventCategoryId[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
];

export const CANONICAL_CATEGORY_LABELS: string[] =
  EVENT_CATEGORY_ORDER.map((id) => EVENT_CATEGORY_NAMES[id]);

export function isCanonicalCategoryLabel(label: string | null | undefined): boolean {
  return !!label && CANONICAL_CATEGORY_LABELS.includes(label);
}

