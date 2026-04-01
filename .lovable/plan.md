
Goal: make the Proactive Mastery Plan and Outer Readiness Brief feel truly state-aware, refresh immediately after a new check-in, and stop showing already-completed practices in the active plan.

What is actually broken now

1. Proactive Mastery Plan brief is still too generic
- `generatePlanBrief()` in `supabase/functions/generate-mastery-plan/index.ts` only uses:
  - time of day
  - calendar counts/load
  - check-in outcome
  - wearable fragments
- It does not use:
  - outer readiness `context`
  - outer readiness `phrase` as rationale
  - decision readiness score in the brief copy
  - coach insights
- Result: lines like “This evening sequence helps you close the day...” still read like generic template text.

2. Mastery Plan and Outer Readiness can drift out of sync
- `generate-mastery-plan` calls `compute-outer-readiness` with only `userId` + `timezoneOffset`.
- But `compute-outer-readiness` expects readiness/check-in inputs from the request for its theme logic.
- So the plan’s server-side outer-readiness dependency is not guaranteed to match the latest readiness state the homepage is showing.

3. New check-ins are not fully invalidating the right caches
- `DailyCheckIn.tsx` invalidates `energy-state`, but `CheckInDetail.tsx` does not invalidate:
  - `outer-readiness`
  - mastery plan cache
- `DailyRitual.tsx` session cache uses a weak “energy hash” that is only the period.
- `generate-mastery-plan` edge cache is keyed only by `userId + period`, so within 30s it can return stale plan data even after a new check-in.
- Result: the old “2 meetings with tight gaps” framing and old plan can persist after the user updates their state.

4. Completed practices are still part of the active plan experience
- In `DailyRitual.tsx`, completed modules are only sorted to the end, not removed.
- In `selectContent()`, if all non-completed candidates are exhausted, fallback logic can still return an already-completed item.
- Result: the user still sees practices they already did, which weakens trust in the refreshed recommendation.

Implementation plan

1. Unify the signal contract between Outer Readiness and Mastery Plan
- File: `supabase/functions/generate-mastery-plan/index.ts`
- When calling `compute-outer-readiness`, pass the same live server-derived fields already fetched in plan generation:
  - `innerReadinessTier`
  - `innerReadinessScore`
  - `clarityLevel`
  - `confidenceLevel`
  - `checkInOutcome`
  - `timezoneOffset`
  - `userId`
- Store full outer readiness response on the request object, not just phrase/driver:
  - `outerReadinessPhrase`
  - `outerReadinessContext`
  - `outerReadinessLeanOn`
  - `outerReadinessWatchFor`

2. Rewrite the mastery plan brief so it answers “why this, why now, for me”
- File: `supabase/functions/generate-mastery-plan/index.ts`
- Expand `generatePlanBrief()` to synthesize:
  - decision readiness score + tier
  - latest check-in outcome
  - outer readiness phrase/context
  - calendar summary
  - wearable strain/recovery signals
  - recent coach insight when relevant
- Brief structure should be:
  - sentence 1: what state the user is in now
  - sentence 2: why this sequence matters and what it is meant to do
- Example direction:
  - “Your decision readiness is down after a dense day, and your body is showing low recovery. The outer brief is asking you to close before tomorrow, so this sequence helps you release load now and protect tomorrow’s first decisions.”

3. Make Outer Readiness evening context reflect the latest check-in, not just the earlier calendar
- File: `supabase/functions/compute-outer-readiness/index.ts`
- Update evening context builders so they blend:
  - retrospective calendar summary
  - current readiness/check-in state
  - wearable signal
  - action implication for tonight
- Add a same-day state-change check using the most recent 2 check-ins so the brief can acknowledge a drop or shift in readiness when relevant.
- This keeps “you navigated 2 tight-gap meetings” but adds “your latest check-in now shows depletion, so tonight is about release and protecting what remains.”

4. Fix stale refresh behavior after the user updates their check-in
- Files:
  - `src/pages/DailyCheckIn.tsx`
  - `src/pages/CheckInDetail.tsx`
  - `src/components/home/DailyRitual.tsx`
  - `src/pages/ConnectedData.tsx` pattern can be reused
- After check-in save and after clarity/confidence save:
  - invalidate `['energy-state', userId]`
  - invalidate `['outer-readiness', userId]`
  - clear session mastery-plan cache for the active period
- Strengthen client plan cache fingerprint in `DailyRitual.tsx` so it includes real state inputs, not just period.
- Replace the edge-function 30s blind cache with a state-aware fingerprint, so a new check-in or completion can bypass stale plan responses.

5. Stop showing completed practices in the refreshed active plan
- Files:
  - `supabase/functions/generate-mastery-plan/index.ts`
  - `src/components/home/DailyRitual.tsx`
- Server-side:
  - hard-exclude `completedToday` from selection
  - remove the fallback that can reinsert completed content
  - if a module has no valid unfinished candidate, omit it rather than resurfacing completed content
- Client-side:
  - render only outstanding modules for the active plan
  - update header/progress copy so it reflects remaining work, not a list padded by already-done items
- This makes the updated plan feel like a prescription for what still needs doing now.

6. Keep module reasoning aligned with the refreshed plan brief
- File: `supabase/functions/generate-mastery-plan/index.ts`
- Extend `getContextualReasoning()` so each card references the same active signal stack:
  - current readiness
  - wearable strain/recovery
  - outer-readiness intent
  - calendar density
- This prevents the plan header and individual cards from feeling disconnected.

7. Update docs so implementation matches product logic
- Files:
  - `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`
  - `docs/OUTER_READINESS_BRIEF_LOGIC.md`
- Document:
  - shared signal contract between outer readiness and mastery plan
  - stale-cache invalidation rules
  - completed-practice exclusion rule
  - same-day readiness-shift handling
  - plan brief composition hierarchy

Technical notes
- Highest-value fixes are:
  1. pass live readiness inputs into server-side outer readiness call
  2. invalidate caches after `CheckInDetail`
  3. remove completed practices from active plan generation
- Without these 3, copy improvements alone will still feel inconsistent or stale.
- No database schema change is required for this fix.

QA to run after implementation
- Do a new evening check-in with a materially different readiness score and confirm:
  - Outer Readiness Brief text changes immediately
  - Proactive Mastery Plan brief changes immediately
  - plan modules change to match the new state
- Complete 1 practice, then update the check-in again in the same period and confirm:
  - completed practice is no longer shown in the active plan
  - progress/header reflects only what remains
- Test on web and native mobile for:
  - full brief visibility
  - no stale cached text after returning from check-in flow
