## Goal

Prevent the Week-Ahead "Frame the week" nudge from firing on a normal workday. Enforce one canonical definition of "last day before returning to work" and route every consumer through it. Empty calendar days must never count as off-days.

## Canonical definitions (to be codified)

Written into `supabase/functions/_shared/availability/availability-classifier.ts` (SSOT) and referenced by Brief, Plan, Nudges — no consumer may re-derive these:

- **Off-day** = SSOT state ∈ {`PTO`, `PUBLIC_HOLIDAY` (applicable to user's home country only), `REST_DAY` (weekend)}. Empty calendar ≠ off-day.
- **Weekend** ≠ **long weekend**. A weekend with no meetings on the adjacent Fri/Mon is still just a weekend.
- **Last day of PTO** = today is `PTO` AND tomorrow is not `PTO`.
- **Last day of public holiday** = today is `PUBLIC_HOLIDAY` (applicable) AND tomorrow is not `PUBLIC_HOLIDAY` and not weekend.
- **Last day of long weekend** = today is an off-day (PTO / applicable holiday / weekend) AND tomorrow is `WORKDAY`/`LIGHT_ROUTINE` AND the immediately-preceding run of off-days (walked back via SSOT only) is ≥ 2. Today itself must be an off-day — the "last day" is inside the break, never on the first working day after it.
- **Sunday trigger** unchanged: `dayOfWeek === 0` and today is not overridden by working-weekend/travel.
- **FYI foreign-region holidays** (e.g. N. Ireland Bank Holiday for a GB-ENG user) are non-events for availability — SSOT already filters via `isApplicableHoliday` + `userHomeCountry`; the lookback must go through the same filter.

## Files to change

1. `supabase/functions/_shared/plan/week-ahead-mode.ts`
   - Add mandatory `todayIsOffDay: boolean` to `WeekAheadInput` (SSOT-derived).
   - Change `last_day_pto`, `last_day_holiday`, `last_day_long_weekend` branches to require `todayIsOffDay === true`. Any branch returning `active: true` (except `manual_override`) must assert today is an off-day; otherwise return `inactive()`.
   - Tighten `last_day_long_weekend` to also require `tomorrowIsWorkday === true` (already there) and `consecutiveOffDaysBefore >= 2` computed from SSOT-classified days only.

2. `supabase/functions/_shared/availability/availability-classifier.ts`
   - Export a helper `classifyDay(input)` returning `{ state, isOffDay }` so consumers can classify any given date, not just "now". No behavioural change to `classifyAvailability`.

3. `supabase/functions/smart-nudges/index.ts` (L1571–1591 and L1477–1495)
   - Replace the per-day `detectDayKindFromEvents` walk-back with a call to `classifyDay` (SSOT) for each of the last 14 days, using the same `userHomeCountry`, weekend rules, and PTO/holiday inputs as the "today" branch.
   - `offDay` becomes `result.isOffDay` only. Remove the `events.length === 0` clause entirely.
   - Compute `todayIsOffDay` from SSOT and pass it into `evaluateWeekAheadMode`.
   - Keep the `[week-ahead-hydration]` log and add a positive-dispatch log line recording the full `WeekAheadInput` bag whenever `active === true`, so future regressions are one query away.

4. `supabase/functions/evaluate-week-ahead-mode/index.ts`
   - Accept and forward `todayIsOffDay` (default `false`) so the frontend hint path stays consistent with the server.

5. Tests
   - `supabase/functions/_shared/plan/week-ahead-mode.test.ts`: add cases for
     - Tue with `consecutiveOffDaysBefore=3`, `tomorrowIsWorkday=true`, `todayIsOffDay=false` → `active=false`.
     - Mon on a normal workday after a plain weekend (`consecutiveOffDaysBefore=2` from weekend only, `todayIsOffDay=false`) → `active=false`.
     - Last day of PTO with `todayIsOffDay=true` → `active=true, reason=last_day_pto`.
     - Sunday trigger unchanged.
   - `supabase/functions/_shared/availability/availability-classifier.test.ts`: GB-ENG user with N. Ireland all-day holiday → `state !== PUBLIC_HOLIDAY`, `isOffDay=false` on a weekday.
   - `smart-nudges` fixture: GB-ENG user, N. Ireland holidays Sun+Mon, empty Fri, workday Thu — expect `consecutiveOffDaysBefore=1` (Sat only; Sun is weekend already counted; empty Fri excluded; N.I. holiday not applicable).

6. `mem://architecture/availability-ssot.md` and `mem://features/notifications/week-ahead-picker-trigger.md`
   - Update to state: empty calendar ≠ off-day; last-day predicates require `todayIsOffDay` from SSOT; the smart-nudges lookback MUST route through `classifyDay`.

## Explicitly out of scope

- No changes to Brief, Plan, or Mastery-Plan business logic.
- No product change to the Sunday-only cadence question — the `last_day_*` branches remain, but are now correctly scoped to actual last-days.
- No UI changes.

## Validation

- `deno test supabase/functions/_shared/plan/week-ahead-mode.test.ts supabase/functions/_shared/availability/availability-classifier.test.ts`
- Replay `scripts/dry-run-week-ahead.ts` for shukrita@mindmodule.me across 29 Jun – 14 Jul: expect `active=false` on Mon 6 Jul, Mon 13 Jul, Tue 14 Jul; `active=true` only on Sun 5 Jul / Sun 12 Jul.
- Manual DB check post-deploy: `notification_log` week of 15 Jul should contain no `week_ahead_picker_invite` outside Sunday afternoon/evening for this user unless PTO/holiday is genuinely applicable.

## Diff shape

```text
week-ahead-mode.ts        +~25 / -~5    (new input + gating branches)
availability-classifier.ts +~15 / -0    (classifyDay helper export)
smart-nudges/index.ts     +~40 / -~20   (SSOT lookback + dispatch log)
evaluate-week-ahead-mode  +~4  / -~1
tests                      +~120 / -0
mem docs                   +~10 / -~4
```
