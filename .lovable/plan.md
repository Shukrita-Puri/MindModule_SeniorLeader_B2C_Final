## Validation: is MRS truly check-in-independent?

**Partially. Two gates still treat check-in as a precondition.**

### What IS already correct
- `compute-inner-readiness` produces a **State 1 baseline score** from physiological composite + calendar demand. No check-in required.
- `computeRefinedScore` correctly degrades to baseline when all four Mind dims are null (`readinessState = 'baseline'`, no shift).
- `TodayStateCard` (Decision Readiness tile) renders `overallBalance` and `tierDisplayed` regardless of check-in.
- `energyStateEngine` computes a score whether or not a check-in row exists.

### What is STILL gated on check-in (the bug)

**1. Brief score row hides behind `hasCheckIn`**
`src/components/home/DecisionReadinessBrief.tsx` lines 1766-1781:
```
{hasCheckIn && score != null ? (<score>) : (<-- Not yet assessed>)}
```
Even when wearable + calendar are present and a real baseline MRS exists, the brief shows `--`. Contradicts MRS v3.

**2. Brief signal contract counts check-in as a State 1 input (wrong)**
`supabase/functions/compute-outer-readiness/index.ts` ~4167-4181:
```
briefSignalContractMet = hasTodayCheckIn || hasFreshWearable
```
This treats check-in as sufficient to "have a brief" — but conceptually State 1 = wearable + calendar; check-in is the State 2 refiner. Also, calendar-only users get suppressed today.

**3. Awaiting-signal copy frames check-in as the trigger to "generate" the brief**
- `DecisionReadinessBrief.tsx` line 1802: *"Update your performance readiness assessment/check in or connect your wearable to generate your performance readiness brief."*
- `DailyRitual.tsx` line 596: same copy on Plan card.
- `DecisionReadinessBrief.tsx` line 1663 fallback phrase: *"Begin with your check-in."*
- Line 1668 fallback body: *"Check in to activate your personalised intelligence — takes two minutes."*

### Out of scope
- `smart-nudges` push CTAs ("check in to set your intention" etc.) — still valid; they invite users into the *enhancer*, which is fine.

---

## Plan: separate State 1 (wearable + calendar) from State 2 (check-in)

### 1. Backend — `compute-outer-readiness` signal contract
- Define **State 1 inputs** = `hasFreshWearable || hasCalendarSignal` (today's calendar events or recent wearable). Check-in does NOT count toward State 1.
- New contract:
  ```
  hasState1Input    = hasFreshWearable || hasCalendarSignal
  briefSignalContractMet = hasState1Input   // brief renders off State 1
  awaitingSignals   = !hasState1Input       // only true for truly empty users
                                            // (no wearable, no calendar)
  awaitingReason    = awaitingSignals ? 'cold-start-no-context' : null
  ```
- Add a derived `hasCalendarSignal` check from the existing calendar fetch (use `calendarState === 'active'` or non-empty events list — whichever the function already computes).
- `readinessState` echoed back to client stays `'refined'` when check-in present, `'baseline'` otherwise. No new field needed.
- All downstream `awaitingSignals ? null : ...` short-circuits stay correct — they now only fire for the residual cold-start case.

### 2. Frontend — `DecisionReadinessBrief.tsx`
- **Score row (1766-1781)**: render the score whenever `score != null`, regardless of `hasCheckIn`. Drop the `--`/"Not yet assessed" branch (it now only appears in the residual cold-start state, handled by the awaiting block).
- **State badge**: append a small muted caption beside the tier label — `"Baseline"` when `readinessState === 'baseline'`, `"Refined"` when `'refined'`. No new visual weight; uses existing muted token.
- **Fallback phrase (1663)**: drop *"Begin with your check-in."* — use a neutral State 1 phrase such as *"Today's read."*
- **Fallback body (1668)**: drop *"Check in to activate..."* — render nothing when no body, never a check-in prompt.
- **Awaiting block (1796-1805)**: keep, but only render when truly cold-start (no wearable, no calendar). Rewrite copy:  
  *"Connect your calendar or a wearable to start your readiness brief. A 2-min check-in then refines it to your felt state."*

### 3. Frontend — `DailyRitual.tsx`
- Same copy swap on line 596:  
  *"Connect your calendar or wearable to start your plan. A 2-min check-in then refines it."*

### 4. Tier-cap / refined surfacing
- No change. `tierDisplayed`, `tierCapReason`, `scoreBaseline`, `scoreRefined`, `readinessState`, `refinedContribution` are already plumbed end-to-end (Phase 1a + 1b). The brief card just needs to read them.

### 5. Verification
- Unit test: existing `computeRefinedScore` tests still pass.
- Manual:
  - (a) wearable only, no check-in → score + tier + "Baseline" caption render.
  - (b) calendar only, no wearable, no check-in → score + "Baseline" caption render.
  - (c) wearable + check-in → score + "Refined" caption.
  - (d) no wearable, no calendar, no check-in → new awaiting block (residual cold-start).

### Files to touch
- `supabase/functions/compute-outer-readiness/index.ts` (signal contract block ~4167-4181 + add `hasCalendarSignal` derivation if not already present)
- `src/components/home/DecisionReadinessBrief.tsx` (score row + State badge + fallback strings + awaiting copy)
- `src/components/home/DailyRitual.tsx` (awaiting copy line 596)

### Explicitly NOT touched
- `smart-nudges` push CTAs
- `compute-inner-readiness` (already correct)
- `energyStateEngine`, `TodayStateCard` (already correct)
- `useOuterReadiness` plumbing (already correct)
- Database schema (already correct)
