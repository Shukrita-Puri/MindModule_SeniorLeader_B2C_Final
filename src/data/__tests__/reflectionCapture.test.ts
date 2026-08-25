import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  REFLECTION_CAPTURE_IDS,
  SOMATIC_NO_CAPTURE_IDS,
  capturesReflection,
} from '../reflectionCaptureIds';
import { CARD_DECK_IDS } from '../cardDeckIds';
import { getContentById } from '../practicesAndSoundscapes';

const serverMirror = readFileSync(
  'supabase/functions/_shared/content/surfaced-content.ts',
  'utf8',
);

function serverList(name: string): string[] {
  const m = serverMirror.match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found in server mirror`);
  return Array.from(m[1].matchAll(/"([^"]+)"/g)).map((x) => x[1]);
}

describe('reflection capture allowlist', () => {
  it('every allowlisted id has a card deck', () => {
    const missing = REFLECTION_CAPTURE_IDS.filter((id) => !CARD_DECK_IDS.includes(id));
    expect(missing).toEqual([]);
  });

  it('somatic decks never capture reflection', () => {
    for (const id of SOMATIC_NO_CAPTURE_IDS) {
      expect(capturesReflection(id)).toBe(false);
    }
  });

  it('jobs-simplicity is a written reframe deck', () => {
    expect(capturesReflection('jobs-simplicity')).toBe(true);
    expect((getContentById('jobs-simplicity') as any)?.subType).toBe('mindset');
  });

  it('server mindset grouping matches the client allowlist', () => {
    const server = serverList('MINDSET_CONTENT_IDS');
    const extra = server.filter((id) => !REFLECTION_CAPTURE_IDS.includes(id));
    expect(extra).toEqual([]);
  });

  it('server somatic grouping excludes reflection capture ids', () => {
    const server = serverList('SOMATIC_CONTENT_IDS');
    const overlap = server.filter((id) => REFLECTION_CAPTURE_IDS.includes(id));
    expect(overlap).toEqual([]);
  });
});
