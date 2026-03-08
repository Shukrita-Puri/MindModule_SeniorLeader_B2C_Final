

# Fix: `compute-outer-readiness` crash on missing `innerReadinessTier`

## Root Cause

The edge function logs show a real runtime error:
```
Error: Cannot destructure property 'leanOn' of 'getLeanOnWatchFor(...)' as it is undefined.
```

`getLeanOnWatchFor` always ends with `return tierFallbacks[tier]` (line 495). But if `innerReadinessTier` arrives as `undefined` or `null` from the request body (e.g. the energy state engine call failed or returned before the tier was set), then `tierFallbacks[undefined]` returns `undefined`, crashing the destructure on line 656.

The client fallback in `energyStateEngine.ts` (line 309) defaults to `'managing'`, but if the edge function call to `compute-inner-readiness` fails or the network request is malformed, the tier can still be missing.

## Fix (1 line change)

In `compute-outer-readiness/index.ts`, add a default for `innerReadinessTier` right after destructuring the body (around line 591):

```typescript
// Change line ~591 from:
innerReadinessTier,
// To a defaulted version after destructuring, e.g. line ~601:
const safeTier: EnergyTier = innerReadinessTier || 'managing';
```

Then use `safeTier` instead of `innerReadinessTier` in all downstream calls: `getTheme()` (line 638), `getLeanOnWatchFor()` (line 657), the "strength without clarity" check (line 647), and the DB upsert.

This is a defensive guard — `'managing'` is the correct neutral default (same as the client fallback).

## Files Changed
- `supabase/functions/compute-outer-readiness/index.ts` — add safe default + use it in 4 references
- Redeploy edge function

