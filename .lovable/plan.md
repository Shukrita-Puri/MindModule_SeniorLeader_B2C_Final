# Reduce Brief LLM attempts from 3 to 2 (one per provider)

## What changes

Only one thing changes: the Executive Brief's LLM attempt ladder in `compute-outer-readiness` drops its third attempt. Everything else — validators, deterministic fallback, awaiting behaviour, Plan logic, UI — stays exactly as it is.

## Findings from the code

- Brief attempt ladder (`supabase/functions/compute-outer-readiness/index.ts`, lines 8265-8290) currently has three entries:
  1. `google/gemini-2.5-flash` via gateway, 15s
  2. Claude Sonnet, 10s
  3. Claude Sonnet again, 10s (corrective-retry pass)
- The Plan "Why this matters" LLM (`supabase/functions/_shared/plan/why-llm.ts`, called once at `generate-mastery-plan/index.ts:7872`) already makes exactly **one** call to a single model, with a 10s abort timeout and a deterministic repair fallback. No retry loop exists there, so no change is needed.

## Ordering note

You asked for "Claude first, then Gemini". The current order is Gemini first, then Claude. Gemini is the cheaper call and currently succeeds most often, so putting Claude first would raise cost rather than cut it. The plan keeps the existing Gemini → Claude order and just removes the duplicate third attempt. Say the word if you want the order flipped anyway.

## Technical detail

Single edit in `supabase/functions/compute-outer-readiness/index.ts`:
- Delete the third element of the `llmAttempts` array (the second Claude Sonnet entry) and its explanatory comment — roughly lines 8278-8290.
- The loop is `for (let attempt = 1; attempt <= llmAttempts.length; attempt++)`, so it self-adjusts to 2 attempts. The corrective-retry prompt logic still applies to attempt 2, and the deterministic/awaiting fall-through after the loop is untouched.

## Verification

- Run `tsgo` typecheck.
- Deploy only `compute-outer-readiness`.
- Report the exact lines changed.
