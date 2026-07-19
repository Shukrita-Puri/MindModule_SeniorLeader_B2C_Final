# Week-Ahead Picker — Simplified Trigger Contract v2

Rewrite the Week-Ahead trigger as a small elimination engine inside the files that already exist. No new engine module, no parallel abstraction. Reason strings become day-neutral: they describe *why* the notification fired, never *which weekday* it fired on.

## Guiding rules

1. **Reuse, don't recreate.** `week-ahead-mode.ts` stays the shared predicate — we rewrite its body. `week-ahead-nudge.ts` stays the nudge-layer wrapper — we simplify it. Availability SSOT (`availability-classifier.ts`) gains one helper. No new files.
2. **Availability SSOT owns "is today the last day of a long weekend".** The Week-Ahead engine consumes an upstream boolean; it does not re-derive it from `consecutiveOffDaysBefore`.
3. **Day-neutral reasons.** The reason vocabulary describes user intent, not the calendar day. `sunday` is gone; both UK-Sun and SA-Sat use `weekly_planning`.
4. **Home Country determines the planning day; local timezone determines delivery time; travel never changes the cadence.**
5. **Same public API surface.** `evaluateWeekAheadMode`, `shouldFireWeekAheadPickerInvite`, `isSaturdayRecoveryDay` keep their names and callers.

## Final reason enum

```ts
export type WeekAheadReason =
  | "weekly_planning"
  | "end_of_pto"
  | "end_of_public_holiday"
  | "end_of_long_weekend"
  | "manual_override";
```

Rename map (search-and-replace scope):

| Old | New |
|---|---|
| `sunday` | `weekly_planning` |
| `last_day_pto` | `end_of_pto` |
| `last_day_holiday` | `end_of_public_holiday` |
| `last_day_long_weekend` | `end_of_long_weekend` |
| `manual_override` | `manual_override` |

Nudge-layer `variant_id` suffixes follow the same names:
`week_ahead_picker_invite::weekly_planning`, `…::end_of_pto`, `…::end_of_public_holiday`, `…::end_of_long_weekend`, `…::manual_override`.

The nudge layer also loses its `_evening` suffix — evening is a delivery-window fact, not a reason. `WEEK_AHEAD_REASONS` and its suffix-collision test become obsolete and are deleted.

## Home Country → planning day

Added inside `week-ahead-mode.ts`:

```ts
const SATURDAY_WEEKLY_COUNTRIES = new Set(["SA","KW","QA","BH","OM","IL"]);
export function planningDayOfWeek(homeCountry?: string | null): 0 | 6 {
  return SATURDAY_WEEKLY_COUNTRIES.has((homeCountry ?? "").toUpperCase()) ? 6 : 0;
}
```

`WeekAheadInput` gains:
- `homeCountry?: string | null` — ISO-2, sourced from `profiles.country`.
- `isLastDayOfLongWeekend?: boolean` — computed upstream by the availability SSOT.
- `consecutiveOffDaysBefore` remains on the type for one release as a deprecated fallback so any cached caller keeps working, then is removed.

## Long-weekend definition (owned by Availability SSOT)

Redefined:

> A **long weekend** is a contiguous block of off-days that contains BOTH the normal weekend AND at least one adjacent PTO or applicable public holiday day.

This eliminates two false positives:
- SA Fri+Sat weekend no longer triggers `end_of_long_weekend` (no adjacent holiday).
- UK plain Sat+Sun no longer triggers it (no adjacent holiday).
- Isolated PTO with no adjacent weekend day is not a long weekend — it goes through `end_of_pto`.
- Isolated public holiday with no adjacent weekend day is not a long weekend — it goes through `end_of_public_holiday`.

Implementation: add `isLastDayOfLongWeekend(input)` to `supabase/functions/_shared/availability/availability-classifier.ts`, next to `classifyDay`. It walks the local-date sequence the caller already passes (same 14-day bag `smart-nudges/index.ts:1978–2032` builds today) and returns `true` iff today is off, tomorrow is a workday, the trailing contiguous off-day block contains ≥1 weekend day AND ≥1 PTO/holiday day. The smart-nudges hydration block emits this boolean alongside the existing counters — same walk, one extra field, no new query.

## New engine body (inside existing `week-ahead-mode.ts`)

```text
if manualOverride: fire(manual_override)

# Trigger 2 — End of PTO
if ptoTodayAllDay and !ptoTomorrowAllDay:
    fire(end_of_pto)

# Trigger 3 — End of Public Holiday
if holidayAllDayEventToday and tomorrowIsWorkday:
    fire(end_of_public_holiday)

# Trigger 4 — End of Long Weekend (upstream boolean)
if isLastDayOfLongWeekend:
    fire(end_of_long_weekend)

# Trigger 1 — Weekly Planning
if dayOfWeek == planningDayOfWeek(homeCountry):
    if ptoTodayAllDay or holidayAllDayEventToday:
        return inactive("weekly_planning_suppressed_off_day")
    fire(weekly_planning)

return inactive()
```

Explicitly removed:
- Global Saturday suppression. Saturday is a valid planning day for SA/KW/QA/BH/OM/IL users.
- `travelDay` and `fullWorkingWeekend` global short-circuits (kept only for `isSaturdayRecoveryDay`, which stays Brief-only).
- Any first-match `sunday` branch that was ordered above the last-day-* checks.

`isSaturdayRecoveryDay` stays exactly as-is — Brief-only, must never suppress the picker.

## Idempotency — per-trigger, per-local-day

Replace ISO-week dedupe (currently in `smart-nudges/index.ts` weekly-cap block):
- After the engine returns `decision.reason`, query `notification_log` scoped to `sent_at >= todayStartLocalUtc` filtered by `variant_id LIKE '%::' || reason` in countable delivery states.
- Row exists → suppress this tick only (same reason, same local day).
- Different-reason sends on the same day are allowed:
  - `Fri end_of_pto` + `Sun weekly_planning` → both fire.
  - `Sat end_of_long_weekend` + `Sun weekly_planning` → both fire.

## Nudge-layer wrapper (`week-ahead-nudge.ts`)

- Delete the hard `if (dayOfWeek === 6) return saturday_recovery_day` branch.
- Delete `WEEK_AHEAD_REASONS` and drop `_evening` from all fire reasons.
- The wrapper collapses to: check hour window (16–19 local), check `alreadySentToday` (now per-reason from caller), check `pickerOpenedToday`, then return `{fire: wam.active, reason: wam.reason}` verbatim.
- Copy variants in `evaluateWeekAheadPickerInvite` (`smart-nudges/index.ts:4311`) are re-keyed to the new reason names. Same three-tone copy, remapped.

## Frontend touchpoints (minimal)

- `src/hooks/useWeekAheadMode.ts`: fallback becomes `dow === planningDayOfWeek(homeCountry) → weekly_planning`. Reason string updated. Server decision still wins.
- `src/hooks/useWeekAheadServerDecision.ts`: no shape change — endpoint still returns `{active, reason}`. The hook is opaque to reason values.
- `src/components/home/WeekAheadPriorities.tsx` + test: if it branches on `reason === "sunday"`, remap to `"weekly_planning"`. Otherwise no change.
- `src/hooks/__tests__/useWeekAheadMode.test.tsx`: update expected reason strings; add SA `homeCountry` case.

## `evaluate-week-ahead-mode` endpoint

Fetch `profile.country` in the same lookup as auth, pass into `evaluateWeekAheadMode`. PTO/holiday remain conservative defaults (endpoint has no calendar visibility); it returns `weekly_planning` on the correct day and lets `list-week-ahead-priorities` / `smart-nudges` decide the end-of-break branches with full calendar data.

## Files touched

Edited:
- `supabase/functions/_shared/plan/week-ahead-mode.ts`
- `supabase/functions/_shared/plan/week-ahead-mode.test.ts`
- `supabase/functions/_shared/plan/week-ahead-nudge.ts`
- `supabase/functions/_shared/plan/week-ahead-nudge.test.ts`
- `supabase/functions/_shared/availability/availability-classifier.ts` (add `isLastDayOfLongWeekend`)
- `supabase/functions/smart-nudges/index.ts` (hydration + dedupe query + copy map)
- `supabase/functions/evaluate-week-ahead-mode/index.ts` (add `profile.country` lookup)
- `supabase/functions/smart-nudges/WEEK_AHEAD_CONTRACT.md`
- `src/hooks/useWeekAheadMode.ts` + `.test.tsx`
- `src/components/home/WeekAheadPriorities.tsx` (only if it branches on reason)
- `mem/features/notifications/week-ahead-picker-trigger.md`
- `scripts/dry-run-week-ahead.ts`, `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql` (reason renames + suffix updates)

Deleted:
- `supabase/functions/_shared/plan/week-ahead-reasons.test.ts` (obsolete once `_evening` suffixes and `WEEK_AHEAD_REASONS` are gone)

Created:
- None.

## Acceptance tests (Deno + Vitest)

1. UK Sun, no PTO/holiday → `weekly_planning`.
2. UK Sun on PTO → suppressed.
3. UK Mon last day of PTO → `end_of_pto`.
4. UK Mon last day of public holiday → `end_of_public_holiday`.
5. UK Sat end of Thu-holiday+Fri+Sat long weekend → `end_of_long_weekend`.
6. UK Fri `end_of_pto` + UK Sun `weekly_planning` same week → both fire.
7. SA Sat, no PTO/holiday → `weekly_planning`.
8. SA Sat on public holiday → suppressed.
9. SA Wed end of PTO → `end_of_pto`.
10. **SA Sat, plain Fri+Sat weekend, no adjacent holiday → `weekly_planning`, NOT `end_of_long_weekend`.**
11. UK Sat, plain Sat+Sun weekend, no adjacent holiday → inactive.
12. UK Sat with adjacent Fri PTO → `end_of_long_weekend`.
13. UK user travelling to Riyadh on Sun (homeCountry=GB) → `weekly_planning` on local Sun.
14. SA user travelling to London on Sat (homeCountry=SA) → `weekly_planning` on local Sat.
15. Two ticks same evening same reason → second suppressed by dedupe.
16. `homeCountry` null → falls back to Sunday planning, one warn log.

## Rollout

- Ship behind existing `WEEK_AHEAD_PICKER_ENABLED` kill switch. No new flag.
- Deploy `smart-nudges`, `evaluate-week-ahead-mode`, and any function importing `_shared/plan/week-ahead-mode.ts` (grep-driven list).
- Verify with `scripts/dry-run-week-ahead.ts` for shukrita@mindmodule.me and 3 sample beta users over the last 4 weeks: at least one `weekly_planning` per user per week (unless suppressed), zero `end_of_long_weekend` false positives on plain weekends.

## Non-goals

- No change to Brief's `isSaturdayRecoveryDay` driver.
- No change to the 16–19 local delivery window.
- No change to picker UI, deep-link, or `/plan?mode=week-ahead` route.
- No change to upstream availability/PTO/holiday detection — Availability SSOT keeps ownership.
- No new DB migration; `notification_log.variant_id` already carries the reason suffix.
