

# Fix: Performance Readiness Brief — LLM Block Runtime Crash

## Root Cause

Two cascading `ReferenceError`s are breaking the entire LLM synthesis pipeline, causing phrase, body, lean on, watch for, and all enrichment fields to fail.

**Error 1 — Temporal Dead Zone**: `const isEvening = hour >= 17;` at line 3241 redeclares a variable already declared at line 1942 (`const isEvening = hour >= 18 || lateEvening`). Both are `const` in the same function scope. JavaScript hoists the later declaration, putting `isEvening` in a "temporal dead zone." When line 3057 uses `isEvening` before line 3241, it throws:
```
ReferenceError: Cannot access 'isEvening' before initialization
```

**Error 2 — Cascading crash**: Error 1 kills the entire LLM block (lines ~2990-3555). `llmLeanOn` and `llmWatchFor` (declared at line 3429) never come into existence. When line 3580 references `llmLeanOn`, it throws:
```
ReferenceError: llmLeanOn is not defined
```

**Visible symptoms**: The card falls back to template phrase ("Sustain the pace.") with no body copy, no lean on, no watch for. Wearable/clarity/confidence data IS being returned correctly (those are computed before the LLM block), so the chips should render if the data exists — but the user's screenshot shows "Connect wearable for full intelligence" which means either the wearable data isn't reaching the client OR there's a separate data flow issue.

## Fix (2 changes in 1 file)

### File: `supabase/functions/compute-outer-readiness/index.ts`

**Change 1**: Rename `const isEvening` at line 3241 to `const isEveningForPrompt` (or simply remove it and reuse the existing `isEvening` from line 1942). Then update its 2 references at lines 3280 and wherever else it's used in the prompt assembly section.

**Change 2**: Move the `llmLeanOn`, `llmWatchFor`, and `llmFallbackReason` declarations (line 3429) OUTSIDE the inner try block — to just before the LLM synthesis try/catch (around line 2988) — so they are always in scope for the response assembly at line 3580. Initialize them as `null`.

### Verification

After deployment, confirm the edge function logs no longer show `isEvening` or `llmLeanOn` errors, and the response includes LLM-generated phrase, body, leanOn, and watchFor fields.

## What Does NOT Change
- Signal chip logic (wearable, clarity, confidence pills) — these are client-side and unaffected
- Calendar pills — client-side rendering, unaffected
- No UI changes
- No migration or schema changes

