

# Plan: Fix LLM Output Pipeline + Supporting Fixes

## Diagnosis from Code + Logs

The logs show the LLM IS being called and returning results (`DRB phrase source: llm`). However, there's a critical enrichment error at line ~2776: `.maybeSingle(...).catch is not a function`. This means the entire enrichment block (lines 2663-2977) throws an error for some queries, causing partial data loss in the prompt. The LLM still gets called but with potentially incomplete signals.

Key findings:
1. **LLM is firing** — logs confirm `phrase source: llm` for the current user
2. **Enrichment queries crash** — `.catch()` on Supabase query builders that don't support it (the `Promise.all` at line 2683 has queries using `.maybeSingle().catch()` which isn't a function on the Supabase query builder)
3. **Weekend awareness missing from LLM prompt** — `isWeekend` is computed (line 2986) but no weekend rule exists in the system prompt
4. **6s timeout is tight** — no retry logic exists
5. **Module-type mismatch possible** — `todModules[0]` fallback at line 2814 can be a coach card when regulate content is empty
6. **Why lines not shown on collapsed slots** — collapsed state only renders practice name

---

## Changes

### 1. `supabase/functions/compute-outer-readiness/index.ts`

**Fix the enrichment query crash (root cause)**
- Lines 2683-2704: The `Promise.all` uses `.catch()` on Supabase query builders. Some queries chain `.maybeSingle().catch()` which fails because `.maybeSingle()` returns a PromiseLike without `.catch()`. Wrap each query in `Promise.resolve(...)` or use `.then(d => d, () => ({ data: null }))` pattern instead of `.catch()`
- This fixes: `TypeError: db.from(...).select(...).eq(...).eq(...).order(...).limit(...).maybeSingle(...).catch is not a function`

**Add weekend rule to LLM system prompt**
- After the existing temporal rules in the system prompt (line 3159-3180), add the weekend/holiday daytime rule as specified: recovery framing, no performance-heavy language, spacious tone

**Increase timeout + add retry**
- Line 3240: Change timeout from 6000ms to 10000ms
- Add one retry with 8000ms timeout on abort/failure
- Log each attempt and duration

**Add diagnostic logging**
- Log the user prompt before LLM call
- Log raw response, parsed result, and fallback reason
- Log signal values (checkInOutcome, clarityLevel, calendarLoad, isWeekend) before prompt assembly

**Explicit fallback reason tracking**
- When falling back to template, log the specific reason (day1, timeout, parse_failed, llm_returned_null)

### 2. `supabase/functions/generate-mastery-plan/index.ts`

**Fix REGULATE slot fallback (Fix 7)**
- Line 2814: Change `|| todModules[0]` to `|| todModules.find(m => !m.isCoachCard) || todModules[0]` — ensure depleted users never get a coach card in slot 1 when seeking regulate content
- Add a guard after slot assignment: if slot practice is a coach card AND the slot label says REGULATE, swap with next non-coach module

**Add data sufficiency to buildWhyLine (Fix 8 partial)**
- Add `checkInCountTotal` and `wearableDaysConnected` parameters
- Gate pattern references behind `checkInCountTotal >= 3`
- Gate HRV correlation behind `wearableDaysConnected >= 7`  
- Change tactical fallback (line 2718) from `"Based on your patterns this week."` to `"For your state and demands today."` when no pattern data
- Wire counts from `buildSharedContext()` through to `buildWhyLine()` calls

### 3. `src/components/home/TodayThreePriorities.tsx`

**Show why line on collapsed slots (Fix 8 UI)**
- Line 575-582: After the practice title in the collapsed state, add the why line in muted italic text:
```tsx
<p className="text-[11px] italic text-muted-foreground/50 font-body truncate">
  {hm.whyLine}
</p>
```

**Add JIT polling (Fix 4 partial)**
- Add a 15-minute interval that checks for new qualifying JIT events while the homepage is visible
- Use `document.visibilityState` to pause when backgrounded
- Stop polling when all 3 slots completed
- On new JIT event detected: clear session cache, trigger re-fetch

### 4. `src/pages/DailyCheckIn.tsx` (Fix 4)

- Verify and ensure plan cache keys are cleared on check-in submission (already partially done — confirm `plan-loaded-*` and `plan-data-*` are cleared)

### 5. `src/hooks/useOuterReadiness.ts` (Fix 3 — cache hierarchy)

- Add period-awareness to the query key: `['outer-readiness', userId, period]` where period = morning/afternoon/evening
- This naturally invalidates across time periods without manual cache management
- React Query's `staleTime` + `refetchOnMount: 'always'` already handles the "serve cache if nothing changed" case

---

## What does NOT change

- Score calculation and tier logic
- Signal chip generation
- Lean On / Watch For cascade logic
- DB queries and table schemas
- Practice card design and styling
- Completion tracking, streak tracking, auth logic
- Template fallback function content (they remain as last-resort safety nets)
- LLM system prompt existing rules (only adding weekend rule)

## Deploy & Verify

- Deploy `compute-outer-readiness` and `generate-mastery-plan`
- Check edge function logs for: LLM call firing, enrichment queries succeeding (no more `.catch` error), signal values populated, fallback reasons logged
- Verify weekend copy appears on Saturday/Sunday
- Verify why lines show on collapsed slots
- Verify REGULATE slot never shows coach card

