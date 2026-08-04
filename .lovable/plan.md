# Wire onboarding goals into Brief, Plan pills, and Week-Ahead tagging

Four surgical edits so the goals a user picks in onboarding actually reach the systems that already know how to use them. Additive and read-only apart from one new profile write. No new features.

## Verified current state

- `profiles.protection_goals` exists (JSONB) — nothing writes to it today; onboarding only stores `growth_priority` (first goal) plus derived tags.
- `compute-outer-readiness` reads `profiles.protection_goals` directly with no fallback, so it resolves empty for existing users.
- `loadJitContextForEvents` already accepts an optional `goals` option and hands it to the selector, which uses `applyProtectGoalMultiplier` and `goalAlignment`. `list-week-ahead-priorities` never passes it.
- `strategic-context.ts` has a v8 fallback, but its trigger condition ignores a missing `protection_goals`.

## Changes

1. **`supabase/functions/complete-onboarding/index.ts`** — after the existing `goals` derivation, set `updateData.protection_goals = goals` when non-empty. Persists selected goal IDs for all future users.

2. **`supabase/functions/compute-outer-readiness/index.ts`** — after the existing `profiles.protection_goals` read, if the resolved list is empty, fall back to `onboarding_v8_responses.goals` (best-effort, try/catch). Covers existing users until change 1 fills the column naturally.

3. **`supabase/functions/list-week-ahead-priorities/index.ts`** — before `loadJitContextForEvents`, load `profiles.protection_goals` and pass `{ goals: { protectGoals } }` in the options. Ranking only: aligned events score higher, nothing is excluded, and null goals leaves behaviour identical.

4. **`supabase/functions/_shared/signal-engine/strategic-context.ts`** — widen the fallback trigger so it also fires when `protection_goals` is missing, keeping goal context in the LLM prompt pre-backfill.

## Verification

- Run `tsgo` across the changed files; expect zero new TypeScript errors.
- Deploy `complete-onboarding`, `compute-outer-readiness`, and `list-week-ahead-priorities`.
- Report lines changed per file.

## Note

Change 3 edits `list-week-ahead-priorities`, which was not in the original deploy list — it needs deploying too or the tagging change never takes effect.