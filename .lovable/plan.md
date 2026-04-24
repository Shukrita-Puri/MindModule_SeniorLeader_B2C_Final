## Root cause confirmed
The server-side gate is only partially implemented.

What is already correct:
- `compute-outer-readiness` now checks `daily_checkins` for the current period (`morning` / `afternoon` / `evening`) before deciding whether the Brief should generate.

What is still wrong:
1. **The client still replays stale Brief data**
   - `useOuterReadiness` hydrates from persistent cache and also keeps prior query data alive via `placeholderData: (prev) => prev`.
   - This lets an older Brief from a previous period briefly paint before the fresh response arrives.

2. **The Brief response still leaks day-scoped state even when awaiting**
   - `compute-outer-readiness` sets `awaitingSignals`, but it still returns `innerReadinessScore` and `checkInOutcome` from the most recent check-in today.
   - `DecisionReadinessBrief` uses `!!checkInOutcome` to decide whether to show the score, so an old score can still appear even when the current period should be awaiting.

3. **Client cache keys use UTC dates, not the user’s local date**
   - Several places use `new Date().toISOString().split('T')[0]`.
   - That is not aligned with the app’s local-time period rules and can cause wrong-period/wrong-day hydration near date boundaries.

## Plan

### 1. Finish the server contract in `compute-outer-readiness`
Make the response fully period-honest, not just phrase/body-honest.

Changes:
- Keep the current-period check-in lookup as the gate.
- When the current period has **no fresh check-in and no fresh wearable data**:
  - keep `awaitingSignals: true`
  - return `phrase`, `bodyText`, `leanOn`, `watchFor` as `null` (already done)
  - also suppress period-sensitive surfaced fields used by the UI:
    - `checkInOutcome: null`
    - `innerReadinessScore: null`
    - `innerReadinessTier: null`
- Add explicit response flags the UI can trust:
  - `hasCurrentPeriodCheckIn`
  - `hasFreshWearable`
  - optionally `hasCurrentPeriodSignal` as the single render flag

Result:
- If the user has not updated this period and no wearable has updated this period, the Brief cannot still look “live” because of leaked score/check-in state.

### 2. Harden Brief caching in `src/hooks/useOuterReadiness.ts`
Stop the client from painting old Briefs across period crossover.

Changes:
- Remove `placeholderData: (prev) => prev`.
- Add a small local-date helper and stop using UTC ISO date strings for Brief cache keys.
- On mount, detect period crossover and clear today’s Brief cache entries for the user before hydrating.
- Sweep other-period Brief keys for the same local date so only the current period can hydrate.
- Persist only fully valid Brief payloads:
  - not awaiting
  - has phrase
  - has body text

Result:
- No afternoon Brief can flash in the evening.
- Reopening the app after a period change lands directly in the awaiting state when no new input exists.

### 3. Tighten Brief rendering in `src/components/home/DecisionReadinessBrief.tsx`
Make the component obey the new server flags instead of inferring readiness from leaked fields.

Changes:
- Change `hadCacheAtMount` so it only treats a cached payload as valid when it is for the current period and is not awaiting.
- Drive the score row from the explicit server flag, not `!!checkInOutcome`.
- Ensure awaiting state always overrides cached content immediately.
- Keep the approved awaiting copy exactly as-is.

Result:
- The Brief becomes binary and stable per period:
  - current-period signal exists → show latest Brief
  - no current-period signal → show awaiting state

### 4. Align Plan date/period handling in `src/components/home/TodayThreePriorities.tsx`
The Plan behavior is closer to correct, but it should use the same local-date contract as the Brief.

Changes:
- Replace UTC date key generation with the same local-date helper.
- Keep the existing “latest check-in in this period wins” regeneration rule.
- Ensure the awaiting gate and cache keys are derived from the same local period/date primitives as the Brief.

Result:
- Brief and Plan follow the exact same period-scoped validity rules.

### 5. Regression coverage
Add targeted tests/QA for the paths that have been unstable.

Tests to add:
- `compute-outer-readiness`:
  - prior-period check-in only + no fresh wearable => awaiting + null surfaced Brief fields
  - multiple check-ins in same period => latest one wins
  - fresh wearable only => Brief allowed
- Manual QA:
  - same-period repeat check-in updates Brief/Plan
  - period crossover with no new input shows awaiting on both
  - app reopen after crossover does not flash old Brief
  - no banned loading copy appears anywhere

## Technical details
```text
Current desired rule

same period + fresh check-in OR fresh wearable
  -> show latest Brief and Plan for that period

cross into next period + no new check-in + no fresh wearable
  -> show awaiting state on Brief and Plan

multiple check-ins inside one period
  -> latest check-in supersedes earlier one
```

Files to update:
- `supabase/functions/compute-outer-readiness/index.ts`
- `src/hooks/useOuterReadiness.ts`
- `src/components/home/DecisionReadinessBrief.tsx`
- `src/components/home/TodayThreePriorities.tsx`
- tests for `compute-outer-readiness`
