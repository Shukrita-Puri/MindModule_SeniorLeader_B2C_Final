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
    expect(src).toMatch(/const archetypeSlug = resolveArchetypeSlug\(/);
    expect(src).toContain('profileUpdate.user_archetype = archetypeSlug');
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

// v2026-09-07 — COS profile depth, storage and correctness contract.
describe('COS profile formation contract', () => {
  const cos = () => read('supabase/functions/synthesize-cos-profile/index.ts');

  it('writes personalisation fields in the types the profiles columns expect', () => {
    const src = cos();
    // inferred_priorities is text[] and leadership_context/pressure_profile are
    // jsonb — a stringified blob into either rejected the whole statement.
    expect(src).not.toContain('inferred_priorities = JSON.stringify');
    expect(src).not.toContain('pressure_profile = JSON.stringify');
    expect(src).toContain('profileUpdate.inferred_priorities = priorities');
    expect(src).toMatch(/profileUpdate\.leadership_context = \{/);
    expect(src).toMatch(/profileUpdate\.pressure_profile = \{/);
  });

  it('surfaces a failed personalisation write instead of swallowing it', () => {
    const src = cos();
    expect(src).toContain('personalisation_write_failed');
    expect(src).not.toContain("console.warn('[synthesize-cos] profiles update warning:'");
  });

  it('treats depth as advisory: any profile is stored usable with a quality label', () => {
    const src = cos();
    expect(src).toContain('function validateCosProfile');
    expect(src).toContain('function scoreProfileQuality');
    expect(src).toContain('cos_profile_quality: quality');
    expect(src).toContain('REVISION REQUIRED');
    expect(src).toMatch(/PLACEHOLDER_PATTERN/);
    expect(src).toContain('function normalizeConfidence');
    // The strict gate must never write needs_input again.
    expect(src).not.toContain("'needs_input'");
  });

  it('uses one Gemini model only, with no cross-model fallback chain', () => {
    const src = cos();
    expect(src).toContain('const AI_MODEL = "google/gemini-3.1-flash-lite"');
    expect(src).not.toContain('AI_MODEL_FALLBACK');
    expect(src).not.toContain('gemini-3.1-pro-preview');
  });

  it('loader uses a thin profile instead of blanking personalisation', () => {
    const src = read('supabase/functions/_shared/leader-profile-loader.ts');
    expect(src).not.toContain("row.cos_profile_status !== 'ready'");
    expect(src).toContain('if (!row || !row.cos_profile) {');
  });

  it('resume never sends a legacy needs_input user backwards', () => {
    const src = read('src/utils/onboardingV8Resume.ts');
    expect(src).toContain('raw === "ready" || raw === "needs_input"');
  });


  it('stores email-ready artefacts whenever a profile is persisted', () => {
    const src = cos();
    expect(src).toContain('cos_profile_email_html');
    expect(src).toContain('cos_profile_email_text');
    expect(src).toContain('cos_profile_email_subject');
    expect(src).toContain('function buildEmailArtifacts');
    // Email HTML must not carry scripts, style blocks or in-app buttons.
    expect(src).toContain('function stripUnsafeForEmail');
  });

  it('resolves the user for a service-role or scheduled sweep call', () => {
    const src = cos();
    expect(src).toContain('isServiceRoleCall');
    expect(src).toContain('CRON_SHARED_SECRET');
    expect(src).toMatch(/userId = bodyUserId/);
  });

  it('completion never nulls an existing generated archetype', () => {
    const src = read('supabase/functions/complete-onboarding/index.ts');
    expect(src).not.toContain('updateData.user_archetype = cosProfile?.provisional_archetype?.name ?? null');
    expect(src).not.toContain('updateData.identity_role = cosProfile?.identity?.role ?? null');
    expect(src).toContain('if (archetypeSlug) updateData.user_archetype = archetypeSlug;');
  });
});
