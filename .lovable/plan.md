

# Fix: `llmLeanOn` / `llmWatchFor` Still Scoped Inside Conditional Block

## Root Cause

The previous fix moved these declarations to line 2985-2987, but that's still **inside** the `if (dataCompleteness !== 'day1') {` block (lines 2529-3560). References at lines 3580-3584 and 3602-3603 are **outside** that block (4-space indent). So the variables are out of scope and throw `ReferenceError`, which crashes the entire function — killing phrase, body, lean on, watch for, and causing the 500 that prevents ALL data (including wearable/calendar/clarity pills) from reaching the client.

**Why pills disappear**: The 500 error means the edge function returns no JSON at all. The client receives an error, so `outerReadinessData` is null, and the entire card falls back to minimal display with no chips, no lean on, no watch for.

## Fix (1 file, 1 change)

### `supabase/functions/compute-outer-readiness/index.ts`

Move the 3 declarations from line 2985-2987 up to line 2495 (right after `llmBodyText`), keeping them at 4-space indent alongside `llmPhrase` and `llmBodyText`:

```typescript
// Line ~2493-2495 (existing)
let llmPhrase: string | null = null;
let llmBodyText: string | null = null;
// ADD these 3 here:
let llmLeanOn: Array<{signal: string; source: string}> | null = null;
let llmWatchFor: Array<{signal: string; source: string}> | null = null;
let llmFallbackReason: string | null = null;
```

Then delete the duplicate declarations at lines 2985-2987.

### Resilience guard

After this fix, add a defensive check at line 3562 (just before the references):

```typescript
// Ensure LLM variables are always defined (defensive)
if (typeof llmLeanOn === 'undefined') llmLeanOn = null;
if (typeof llmWatchFor === 'undefined') llmWatchFor = null;
```

This prevents future scope bugs from crashing the response assembly.

### Redeploy

Deploy `compute-outer-readiness` and verify via curl that the function returns 200 with populated `leanOn`, `watchFor`, `bodyText`, and all wearable/calendar enrichment fields.

## What This Fixes
- **500 error** → function returns 200 with full data
- **Wearable pills** → data was always computed correctly, just never reached the client due to the crash
- **Calendar pills** → same — data exists but response was killed
- **Clarity/confidence pills** → same
- **Lean on / Watch for** → LLM output now reaches the response assembly
- **Body copy** → was already in outer scope, but the 500 killed it

## What Does NOT Change
- No UI changes
- No schema changes
- Signal pill logic, chip rendering, score row — all untouched

