---
name: Week-Ahead last-day-only rule
description: Week-Ahead priorities fire only on the final day of an off-run (last weekend day, last PTO day, last holiday day, last day of a long weekend), never mid-run and never after
type: feature
---

Week-Ahead may only activate on the LAST day of an off-run:
last weekend day, last PTO day, last public-holiday day, last day of a long
weekend (plus manual override). Never mid-run, never on the return-to-work day.

Enforcement lives in `evaluateWeekAheadMode` (`_shared/plan/week-ahead-mode.ts`)
via the optional `tomorrowIsOffDay` input: when `true`, every branch
(end_of_pto, end_of_public_holiday, end_of_long_weekend, weekly_planning) is
suppressed. Left `undefined` by callers without calendar visibility so their
behaviour is unchanged.

Wired: `week-ahead-hydration.ts` returns `tomorrowIsOffDay`; smart-nudges,
generate-mastery-plan, build-executive-home-cards/day-type and
compute-outer-readiness (spread hydration) all pass it. The Brief's early
unhydrated `week_recap` driver stamp is provisional and reverted by the
hydrated pass when the run continues.
