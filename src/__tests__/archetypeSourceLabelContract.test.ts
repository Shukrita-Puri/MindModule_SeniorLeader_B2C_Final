import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('archetype slug resolver wiring', () => {
  it('compute-outer-readiness normalises user_archetype at the profile read', () => {
    const src = read('supabase/functions/compute-outer-readiness/index.ts');
    expect(src).toContain('from "../_shared/archetype-slug.ts"');
    expect(src).toMatch(/serverArchetype = resolveArchetypeSlug\(/);
    expect(src).not.toMatch(/serverArchetype = profileRes\.data\?\.user_archetype \|\| null/);
  });

  it('generate-mastery-plan normalises the same field so Plan and Brief agree', () => {
    const src = read('supabase/functions/generate-mastery-plan/index.ts');
    expect(src).toContain('from "../_shared/archetype-slug.ts"');
    expect(src).toMatch(/req\.archetype = resolveArchetypeSlug\(/);
  });

  it('synthesize-cos-profile persists a canonical slug, not the free-text name', () => {
    const src = read('supabase/functions/synthesize-cos-profile/index.ts');
    expect(src).toContain('canonical_slug');
    expect(src).toMatch(/user_archetype: resolveArchetypeSlug\(/);
  });
});

describe('lean on / watch for source labels', () => {
  it('server labels a matrix hit ARCHETYPE and a tier fallback TIER', () => {
    const src = read('supabase/functions/compute-outer-readiness/index.ts');
    expect(src).toContain('"archetype-tier": "ARCHETYPE"');
    expect(src).toContain('"tier-fallback": "TIER"');
    expect(src).not.toContain('"tier-fallback": "PATTERN"');
  });

  it('client renders the same distinction', () => {
    const src = read('src/components/home/DecisionReadinessBrief.tsx');
    expect(src).toContain("case 'archetype-tier': return 'Archetype';");
    expect(src).toContain("case 'tier-fallback': return 'Tier';");
  });
});
