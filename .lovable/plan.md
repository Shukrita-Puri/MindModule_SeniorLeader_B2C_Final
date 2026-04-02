

# Em-Dash → En-Dash Replacement + Dead Code Removal

## Part 1: Em-Dash (—) → En-Dash (–) Replacement

**85 source files** contain em-dashes. Every `—` in `.ts` and `.tsx` files (excluding `node_modules`) must be replaced with `–`.

This is a global find-and-replace. No logic changes – purely cosmetic text.

### Files with user-visible copy (highest priority)
These produce text the user reads on screen or in statements:
- `supabase/functions/compute-inner-readiness/index.ts` (~20 occurrences in statement strings)
- `supabase/functions/compute-outer-readiness/index.ts` (~30 occurrences in context/compass copy)
- `supabase/functions/generate-mastery-plan/index.ts` (~15 occurrences in plan brief/urgency copy)
- `src/components/simulation/StrengthsSection.tsx` (separator in UI)
- `src/components/CollegeAdmissionsSimulation.tsx` (simulation dialogue text)
- `src/pages/onboarding/stages/Stage8Results.tsx` (results copy)

### Files with developer comments only
All remaining ~79 files use em-dashes in code comments. These will also be replaced for consistency but have no user-visible impact.

### Approach
Run a single `sed` replacement across `src/` and `supabase/functions/` directories, replacing all `—` with `–`. Then verify build passes.

---

## Part 2: Dead Code Removal

### Confirmed dead files (zero live imports)

| File | Status | Safe to delete |
|------|--------|---------------|
| `src/utils/planReconstruction.ts` | Marked `@deprecated`, only imports from `performancePlanEngine` | Yes |
| `src/utils/performancePlanEngine.ts` | Marked `@deprecated`, only imported by `planReconstruction.ts` | Yes |
| `src/components/_archived/MainNavigation.tsx` | In `_archived` folder, zero imports | Yes |
| `src/components/_archived/PsychologicalDimensionBubbles.tsx` | In `_archived` folder, zero imports | Yes |

### File to keep but note

| File | Status | Action |
|------|--------|--------|
| `src/utils/userArchetypeEngine.ts` | Marked `@deprecated` but actively imported by `FrictionAndStrengthDetail.tsx` | Keep – still in use |

### Approach
1. Delete the 4 dead files
2. Remove the `_archived` directory
3. Verify TypeScript build passes

---

## Implementation Order

1. Global em-dash → en-dash replacement (all 85 files via sed)
2. Delete 4 dead files + `_archived` directory
3. Build verification

## Risk Assessment
- **Em-dash replacement**: Zero logic risk – character substitution in strings and comments only
- **Dead code deletion**: Zero risk – confirmed no live imports exist for any deleted file
- `userArchetypeEngine.ts` is deliberately kept because `FrictionAndStrengthDetail.tsx` uses it

