import { describe, it, expect } from 'vitest';
import { sanctuaryContent } from '@/data/practicesAndSoundscapes';
import {
  SURFACED_CONTENT_IDS,
  HIDDEN_CONTENT_IDS,
  DISPLAY_TITLE_OVERRIDES,
  getDisplayTitle,
  isSurfacedContent,
} from '@/data/contentSurfacing';
import { CARD_DECK_IDS, routeForContent } from '@/data/cardDeckIds';
import { SURFACED_CONTENT_IDS as SERVER_SURFACED } from '../../../supabase/functions/_shared/content/surfaced-content';

describe('content surfacing SSOT', () => {
  it('client and server allowlists match', () => {
    expect([...SERVER_SURFACED].sort()).toEqual([...SURFACED_CONTENT_IDS].sort());
  });

  it('hidden ids are never plan-eligible', () => {
    for (const id of HIDDEN_CONTENT_IDS) expect(isSurfacedContent(id)).toBe(false);
  });

  it('every surfaced id resolves in the catalogue', () => {
    const ids = new Set(sanctuaryContent.map((c) => c.id));
    for (const id of SURFACED_CONTENT_IDS) expect(ids.has(id)).toBe(true);
  });

  it('catalogue titles equal the canonical display titles', () => {
    for (const c of sanctuaryContent) {
      expect(getDisplayTitle(c.id)).toBe(c.title);
    }
  });

  it('overrides cover the agreed renames', () => {
    expect(DISPLAY_TITLE_OVERRIDES['stoic-reflection']).toBe('Stoic Evening Clarity & Reflection');
    expect(DISPLAY_TITLE_OVERRIDES['ina-night-fields']).toBe("Nature's Rhythm for Stillness");
    expect(DISPLAY_TITLE_OVERRIDES['buddhist-phoenix']).toBe('Resilience Through The Phoenix Approach');
    expect(DISPLAY_TITLE_OVERRIDES['sustained-focus-choir-harmonic']).toBe('Grounding Focus with Cathedral Choir');
  });

  it('routes micro-practices to /cards only when a deck exists', () => {
    expect(routeForContent('presence-grounding-new', 'micro-practice')).toBe('/micro-practice/presence-grounding-new/cards');
    expect(routeForContent('grounding-touch', 'micro-practice')).toBe('/micro-practice/grounding-touch');
    expect(routeForContent('harmonic-calm', 'soundbath')).toBe('/soundscapes/harmonic-calm');
    expect(CARD_DECK_IDS).toContain('stoic-reflection');
  });
});
