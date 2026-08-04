# Lean On / Watch For — make the ARCHETYPE source actually archetype-aware

## What I found (verified against code and live data)

The fix you proposed is **already implemented** in two places:

- `complete-onboarding/index.ts` L163 writes `user_archetype = cos_profile.provisional_archetype.name`
- `synthesize-cos-profile/index.ts` L670 writes the same field (richer overwrite)

So the write is not the gap. The real gap is a **vocabulary mismatch**.

The archetype matrix in `compute-outer-readiness/index.ts` (L2374) is keyed on nine fixed slugs:

```text
grounded-leader, resilient-performer, clear-thinker, intensity-driver,
adaptive-navigator, natural-regulator, high-octane-performer,
strategic-pauser, awareness-builder
```

But the CoS profile produces free-text LLM names. Live rows today:

```text
"The Architect-Commander"   "The Athlete"   "The Juggler (Provisional)"
```

None of these match a matrix key, so `archetypeMatrix[archetype]?.[tier]` misses and every v8 user falls through to `tierFallbacks[tier]` — the exact tier-only outcome the fix was meant to avoid. Legacy beta users still hold valid slugs (grounded-leader x14, adaptive-navigator x13), so they do get archetype-aware content.

Secondary observation: one completed v8 user with `cos_profile_status = 'ready'` still has `user_archetype` null, so the write also needs a backfill sweep.

## The plan

### 1. Add a canonical archetype resolver (shared module)

New file `supabase/functions/_shared/archetype-slug.ts`:

- Exports the nine canonical slugs as the single source of truth.
- `resolveArchetypeSlug(raw: string | null): CanonicalArchetype | null`
  - passes canonical slugs through unchanged (legacy beta users keep working)
  - lowercases, strips `The `, `(Provisional)`, punctuation
  - keyword-maps free-text CoS names onto the nearest canonical slug
    (e.g. architect/strategist/planner → `strategic-pauser`; commander/driver/operator → `intensity-driver`; athlete/performer → `resilient-performer`; juggler/navigator → `adaptive-navigator`; analyst/thinker → `clear-thinker`; steward/anchor → `grounded-leader`; regulator/steady → `natural-regulator`; sprinter/high-output → `high-octane-performer`; learner/builder → `awareness-builder`)
  - returns `null` when nothing matches (tier fallback stays the honest default)

### 2. Ask the CoS synthesis for the slug directly

In `synthesize-cos-profile/index.ts`, extend the `emit_cos_profile` tool schema so `provisional_archetype` also carries a `canonical_slug` enum constrained to the nine values, and persist `user_archetype = resolveArchetypeSlug(canonical_slug ?? name)`. The display name stays in `archetype_title` / `archetype_description`, which is what the UI and the LLM voice layer already read.

### 3. Normalise at read time too

In `compute-outer-readiness/index.ts` L3386, wrap the read:

```ts
const serverArchetype = resolveArchetypeSlug(profileRes.data?.user_archetype ?? null);
```

This makes existing rows with free-text names work immediately, without waiting for a re-synthesis. Same treatment at the `generate-mastery-plan` L4939 read so Plan and Brief agree on the archetype dimension.

### 4. Backfill existing rows

One data pass: for every profile whose `user_archetype` is null or non-canonical and whose `onboarding_v8_responses.cos_profile_status = 'ready'`, map `provisional_archetype.name` through the resolver and write the slug. Rows that resolve to null are left null.

### 5. Tests

New `supabase/functions/_shared/archetype-slug.test.ts`:

- the nine canonical slugs round-trip unchanged
- the three live free-text names resolve to a canonical slug
- `"The Juggler (Provisional)"` → `adaptive-navigator` (suffix stripping)
- unknown text → `null`
- a `compute-outer-readiness` guard test asserting the resolver is applied at the profile read

## Notes

- No schema change. `profiles.user_archetype` keeps holding a slug, as it always has.
- Priority order for Lean On / Watch For is unchanged — coach and pattern sources still win over the archetype matrix.
- The `· ARCHETYPE` label will stay on tier-only fallbacks; if you'd prefer that fallback to be labelled distinctly (e.g. `· TIER`), say so and I'll fold that in.
