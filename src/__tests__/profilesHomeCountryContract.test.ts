/**
 * Contract guard: `public.profiles` has NO `home_country` column.
 * `profiles.country` is the single source of truth; `home_country` exists
 * only on `onboarding_v8_responses`. Any profile projection or update that
 * references `home_country` fails the whole query with Postgres 42703.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  'src/utils/planLocaleContext.ts',
  'supabase/functions/evaluate-week-ahead-mode/index.ts',
  'supabase/functions/smart-nudges/index.ts',
  'supabase/functions/complete-onboarding/index.ts',
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('profiles.home_country contract', () => {
  for (const rel of FILES) {
    it(`${rel} never selects home_country from profiles`, () => {
      const src = read(rel);
      const selects = src.match(/\.select\((['"`])[^'"`]*\1\)/g) ?? [];
      const offending = selects.filter((s) => s.includes('home_country'));
      expect(offending).toEqual([]);
    });
  }

  it('complete-onboarding writes country only, never profiles.home_country', () => {
    const src = read('supabase/functions/complete-onboarding/index.ts');
    expect(src).toContain('updateData.country = homeCountry;');
    expect(src).not.toContain('updateData.home_country');
  });

  it('complete-onboarding still reads home_country from onboarding responses', () => {
    const src = read('supabase/functions/complete-onboarding/index.ts');
    expect(src).toContain('v8Row.home_country');
  });
});

/**
 * Behavioural mirror of the onboarding mapping: an onboarding-collected
 * home_country of 'SA' must land on profiles.country and nowhere else.
 */
function buildProfileUpdate(v8Row: { home_country?: unknown }) {
  const updateData: Record<string, unknown> = {};
  const homeCountry = typeof v8Row.home_country === 'string'
    ? v8Row.home_country.trim()
    : null;
  if (homeCountry) {
    updateData.country = homeCountry;
  }
  return updateData;
}

describe('onboarding home_country -> profiles.country mapping', () => {
  it("maps onboarding home_country 'SA' to profiles.country", () => {
    const update = buildProfileUpdate({ home_country: 'SA' });
    expect(update.country).toBe('SA');
    expect(Object.keys(update)).not.toContain('home_country');
  });

  it('omits country when onboarding never collected one', () => {
    expect(buildProfileUpdate({})).toEqual({});
  });
});