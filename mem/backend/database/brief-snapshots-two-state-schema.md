---
name: brief-snapshots-two-state-schema
description: brief_snapshots is the canonical two-state MRS store with baseline_* and refined_* column pairs and a DB-enforced ±15 rule.
type: feature
---

`brief_snapshots` holds both states of MRS v3 on a single row keyed by
`(user_id, local_date, time_window, input_signature, prompt_version)`.

## Columns

Two parallel column families, mutually exclusive per row in current writers:
- `refined_score / refined_tier / refined_phrase / refined_body_text / refined_lean_on(_source) / refined_watch_for(_source) / refined_signal_pills / refined_state`
- `baseline_score / baseline_tier / baseline_phrase / baseline_body_text / baseline_lean_on(_source) / baseline_watch_for(_source) / baseline_signal_pills / baseline_state`

State tags:
- `baseline_state` ∈ `'baseline' | 'cold-start' | NULL`
- `refined_state` ∈ `'refined' | NULL`

## DB-level rule

`refined_score_within_baseline_range` CHECK constraint:
```
baseline_score IS NULL OR refined_score IS NULL
  OR refined_score BETWEEN baseline_score - 15 AND baseline_score + 15
```
Historical 335 rows pre-date `baseline_*` so `baseline_score IS NULL` → exempt.
All new writes that populate both must respect ±15.

## Write contract

`compute-outer-readiness` upsert:
- `checkInOutcome` truthy → write `refined_*` + `refined_state='refined'`.
- otherwise → write `baseline_*` + `baseline_state='baseline'`.
Same row, mutually exclusive sets. A future iteration may populate both on
the same row; the CHECK constraint already enforces the ±15 ceiling.

User-update guard `brief_snapshots_user_update_guard` blocks edits to every
field except `user_rating` and `feedback_text`; service role bypasses.

## Read contract / back-compat

Server projections at `brief-by-id` and `brief-history` coalesce
`refined_* ?? baseline_*` into legacy keys (`phrase`, `body_text`, `lean_on`,
`watch_for`, `score`, `tier`, `signal_pills`) so existing UI keeps working
while also exposing both raw sets for new two-state readers.

Weekly MRS dial (`mental-fitness-scores GET_WEEKLY_DELTA`) sources from
`brief_snapshots`, one row per `local_date` (latest by `created_at`), and
falls through `baseline_score → refined_score` so the 335-row history is
usable.

## Forbidden

- Do not re-add `score / tier / phrase / body_text / lean_on / watch_for /
  signal_pills` columns. They were renamed to `refined_*`.
- Do not bypass the CHECK constraint by writing refined > ±15 from baseline.
  Clamp upstream in the edge function instead.
