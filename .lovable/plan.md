

# Fix: `coachStateHash` used before initialization crashes mastery plan

## Root cause

The `generate-mastery-plan` edge function is crashing with:
```
ReferenceError: Cannot access 'coachStateHash' before initialization
```

At line 2266, inside the JIT pre-event plan builder, `coachStateHash` is referenced in a call to `generateCoachCard()`. But `coachStateHash` is defined later at line 2297 (in the Time-of-Day section). Since `const` declarations are not hoisted, this crashes the function before it can return any plan data.

This is why the homepage shows "Your plan is being prepared. Pull down to refresh." — the edge function returns nothing.

## Fix

**File: `supabase/functions/generate-mastery-plan/index.ts`**

Move the `coachStateHash` declaration from line 2297 to before the JIT section that uses it — specifically, insert it just before the JIT plan assembly block (around line 2258, before `if (preEventModules.length > 0)`). The definition itself stays identical:

```typescript
const coachStateHash = String(hashCode(`${req.innerReadinessTier}:${req.checkInOutcome}:${req.innerReadinessScore}:${req.outerReadinessPhrase}:${timeOfDay}`));
```

Remove the duplicate at line 2297 (or keep it as-is since `const` won't allow redeclaration — so it must be moved, not duplicated).

This is a one-line move. No logic changes needed.

## Impact

- Fixes the crash immediately — both JIT and ToD plans will generate again
- No behavioral change to any other logic

