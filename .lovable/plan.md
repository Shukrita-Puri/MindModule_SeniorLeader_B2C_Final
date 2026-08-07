# Audit: three Resilience contributors for shukrita@mindmodule.me

All three values are arithmetically correct for the data this account has. None is a display bug. Two of them, though, are effectively unreachable for this user because their inputs are empty — that is the real finding.

## 1. Sustained Deficit: No — correct

Rule: HRV must sit at or below -20% of the 30-day baseline for two or more consecutive samples, walking back from the most recent.

Live data (30-day HRV baseline 26.1 ms, 16 samples):

```text
07 Aug   no HRV        (skipped)
06 Aug   18.3 ms   -30%   deficit
05 Aug   no HRV        (skipped)
04 Aug   24.3 ms    -7%   breaks the streak
```

Streak = 1, so the flag is No. Working as specified.

Caveat: the walk-back filters out days with no HRV rather than treating them as a break, so 6 Aug and 4 Aug count as "consecutive" despite the gap. It did not change the answer here, but on a sparse ring it can join non-adjacent days.

## 2. Protected Goals: 0 — correct number, empty source

The pill counts `profiles.protection_goals`, falling back to `onboarding_v8_responses.goals`. For this account:

- `profiles.protection_goals` = null
- `onboarding_v8_responses.goals` = `[]` (row created 15 Jul)

So 0 is honest. The cause is upstream: onboarding finished with no goals selected, and `complete-onboarding` only writes `protection_goals` when `goals.length > 0`. The earlier backfill could not help an account whose source array is empty. Nothing in the pill needs fixing; the goal-capture step does.

## 3. HRV x High-Demand (7d): None observed — correct, but starved

The detector joins HRV days against per-day calendar load and counts days where HRV is at or below -10% of baseline and that day's load tier is `high`.

Live data: the earliest calendar event stored for this user is 6 Aug 2026, and the day-of-week history query only reads days strictly before today. So the trailing-7-day join has at most one historical day carrying a load tier, and those days hold 2-3 small events (no high-attendee meetings) — nowhere near a `high` tier.

Result: `days_observed` is effectively 0-1 and the count is 0. The signal is not broken; it has no calendar history to work with. It should start producing reads about a week after the calendar has been syncing continuously.

## Verdict

No corrective code change is required for these three metrics. Two optional follow-ups, each fully isolated:

1. Make the sustained-deficit walk-back gap-aware — a missing HRV day breaks the streak instead of being skipped.
2. Capture protection goals for accounts that finished onboarding with an empty goals array (a settings-side prompt), so the contributor stops reading 0 permanently.

Say which one you want and I will plan it on its own.