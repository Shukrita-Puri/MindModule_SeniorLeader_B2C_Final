# Executive Home Cards Testing Guide

This document explains, in plain English, how the 3 Executive Home cards work:

1. `Mental Readiness Score`
2. `Performance Readiness Brief`
3. `Today's Performance Priorities`

It includes:

- Which database tables matter
- Which backend functions generate each card
- Which frontend files display each card
- How to insert test data
- What SQL to run to verify each step

This guide is written for localhost / staging-style manual testing.

## 1. Big Picture

The 3 cards are a chain:

1. Raw inputs come from:
   - `wearable_data`
   - `daily_checkins`
   - `calendar_events`
2. `compute-inner-readiness` calculates the MRS score.
3. `compute-outer-readiness` uses that MRS result plus calendar / wearable / check-in context to generate the Brief and to persist snapshots.
4. `generate-mastery-plan` uses the MRS + Brief context to generate the Plan card.
5. `build-executive-home-cards` is the orchestrator that runs all 3 in order for one date/window.

In short:

- MRS depends on wearable + check-in + calendar context
- Brief depends on MRS + same-day context
- Plan depends on MRS + Brief + calendar context

## 2. Main Tables

### Input tables

#### `wearable_data`

Used for HRV, resting heart rate, sleep score, sleep duration.

Important columns:

- `user_id`
- `summary_date`
- `hrv`
- `resting_heart_rate`
- `sleep_score`
- `total_sleep_minutes`
- `heart_rate`
- `source`
- `source_provider`

#### `daily_checkins`

Used for the mental / emotional self-report side.

Important columns:

- `id`
- `user_id`
- `checkin_date`
- `timestamp`
- `time_window`
- `outcome`
- `clarity_level`
- `confidence_level`
- `emotion_level`
- `pressure_level`
- `regulation_level`
- `energy_balance`
- `skipped`

#### `calendar_events`

Used for demand / load / day-type / JIT plan context.

Important columns:

- `user_id`
- `external_id`
- `title`
- `start_time`
- `end_time`
- `provider`
- `is_all_day`
- `is_organizer`
- `is_recurring`
- `attendees_count`
- `event_metadata`

### Persisted snapshot tables

#### `daily_context_snapshot`

This is the most important snapshot table for MRS.

It stores the current window's persisted MRS and score context.

Important columns:

- `user_id`
- `local_date`
- `mrs_window`
- `inner_score`
- `inner_tier`
- `readiness_score_baseline`
- `readiness_score_refined`
- `readiness_state`
- `tier_displayed`
- `tier_cap_reason`
- `weight_provenance`
- `signal_pills`
- `calendar_demand_score`
- `pattern_signals`

#### `brief_snapshots`

This stores the current window's Brief payload.

Important columns:

- `user_id`
- `local_date`
- `time_window`
- `prompt_version`
- `input_signature`
- `brief_source`
- `phrase`
- `body_text`
- `lean_on`
- `watch_for`
- `score`
- `tier`
- `signal_pills`
- `baseline_score`
- `refined_score`
- `baseline_state`
- `refined_state`

#### `mastery_plan_snapshots`

This stores the current window's persisted Plan.

Important columns:

- `user_id`
- `plan_date`
- `mrs_window`
- `status`
- `plan_json`
- `horizon_modules`
- `priorities`
- `recommended_practice_ids`
- `input_signature`

## 3. Backend Flow

### Card 1: Mental Readiness Score

Primary backend pieces:

- [build-executive-home-cards/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/build-executive-home-cards/index.ts:618)
- [compute-inner-readiness/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/compute-inner-readiness/index.ts:1)
- [compute-outer-readiness/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/compute-outer-readiness/index.ts:5998)

Actual logic:

1. The orchestrator loads today's latest wearable row, today's check-in, and today's calendar context.
2. It calls `compute-inner-readiness`.
3. That function returns:
   - `score`
   - `scoreBaseline`
   - `scoreRefined`
   - `readinessState`
   - `tier`
   - `tierDisplayed`
   - `weightProvenance`
4. `compute-outer-readiness` mirrors the MRS result into `daily_context_snapshot`.
5. The UI MRS card reads that snapshot first.

Important rule:

- The MRS score is window-based: `morning`, `afternoon`, `evening`
- The UI should show the row for today's `local_date` and current `mrs_window`

### Card 2: Performance Readiness Brief

Primary backend pieces:

- [compute-outer-readiness/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/compute-outer-readiness/index.ts:6200)
- [get-current-brief-snapshot/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/get-current-brief-snapshot/index.ts:1)

Actual logic:

1. `compute-outer-readiness` receives MRS fields from the previous step.
2. It computes:
   - brief copy
   - signal pills
   - score payload for the Brief surface
3. It writes the result into `brief_snapshots`.
4. The Brief UI can read from:
   - current `brief_snapshots` row
   - live `useOuterReadiness` payload

Important rule:

- Brief should match the same window as MRS
- If a valid MRS snapshot already exists, Brief should not drift to a different score

### Card 3: Today's Performance Priorities

Primary backend pieces:

- [generate-mastery-plan/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/generate-mastery-plan/index.ts:3088)
- [get-mastery-plan-snapshot/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/get-mastery-plan-snapshot/index.ts:1)

Actual logic:

1. The Plan checks whether there is enough readiness context to generate.
2. It reads:
   - today's check-in
   - current MRS snapshot
   - calendar context
   - outer-readiness / brief context
3. If there is enough signal, it generates `horizon_modules` and `priorities`.
4. It writes the result to `mastery_plan_snapshots`.

Important gate:

- Plan will not generate if readiness is still treated as `awaiting`
- A valid MRS snapshot is the strongest signal that Plan should proceed

## 4. Frontend Display Flow

### Mental Readiness Score UI

Main files:

- [MrsPage.tsx](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/components/home/mrs/MrsPage.tsx:18)
- [useMrsSnapshot.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/hooks/useMrsSnapshot.ts:64)

Actual UI behavior:

1. UI asks for today's `local_date`
2. UI asks for current `mrs_window`
3. UI loads `daily_context_snapshot` through `get-mrs-snapshot`
4. If snapshot has numeric score, UI shows it
5. If not, UI falls back to live `useOuterReadiness`

### Performance Readiness Brief UI

Main files:

- [DecisionReadinessBrief.tsx](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/components/home/DecisionReadinessBrief.tsx:1815)
- [useCurrentBriefSnapshot.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/hooks/useCurrentBriefSnapshot.ts:90)

Actual UI behavior:

1. UI loads the current window's `brief_snapshots` row
2. If snapshot is renderable, it overlays that data onto the live outer-readiness payload
3. If snapshot is missing, UI uses live `useOuterReadiness`

### Today's Performance Priorities UI

Main files:

- [TodayThreePriorities.tsx](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/components/home/TodayThreePriorities.tsx:245)
- [useMasteryPlanSnapshot.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/src/hooks/useMasteryPlanSnapshot.ts:56)

Actual UI behavior:

1. UI checks MRS snapshot first
2. UI decides whether readiness is still awaiting
3. UI loads `mastery_plan_snapshots` for current date/window
4. If there is a ready snapshot, it hydrates the card
5. Otherwise it calls `generate-mastery-plan`

## 5. Recommended Test Order

Always test in this order:

1. Insert raw inputs:
   - wearable
   - check-in
   - calendar
2. Trigger the builder:
   - `build-executive-home-cards`
3. Check snapshots:
   - `daily_context_snapshot`
   - `brief_snapshots`
   - `mastery_plan_snapshots`
4. Only after that check the UI

If you test the UI before checking the snapshots, it is much harder to know whether the bug is:

- input problem
- backend generation problem
- snapshot persistence problem
- UI read/render problem

## 6. Test Insert SQL

Replace values if needed:

- `user_id = 'linkedin|DFUJTWpo4O'`
- `local_date = '2026-07-06'`
- `window = 'evening'`

### 6.1 Insert wearable data

Use at least 5 to 10 days so baseline / trends have enough context.

```sql
delete from wearable_data
where user_id = 'linkedin|DFUJTWpo4O'
  and summary_date between '2026-06-27' and '2026-07-06';

insert into wearable_data (
  user_id,
  summary_date,
  hrv,
  resting_heart_rate,
  sleep_score,
  total_sleep_minutes,
  heart_rate,
  sleep_efficiency,
  source,
  source_provider
)
values
  ('linkedin|DFUJTWpo4O', '2026-06-27', 53, 59, 81, 425, 72, 86, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-06-28', 54, 58, 82, 430, 72, 87, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-06-29', 55, 60, 83, 435, 72, 87, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-06-30', 56, 59, 84, 440, 72, 88, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-01', 57, 58, 80, 445, 72, 88, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-02', 58, 60, 81, 450, 72, 88, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-03', 59, 59, 82, 455, 72, 89, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-04', 60, 58, 83, 460, 72, 89, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-05', 61, 60, 84, 465, 72, 89, 'manual_test', 'manual_test'),
  ('linkedin|DFUJTWpo4O', '2026-07-06', 62, 58, 86, 450, 72, 90, 'manual_test', 'manual_test');
```

### 6.2 Insert daily check-in

Important:

- `timestamp` is required
- `time_window` must match the window you want to test

```sql
delete from daily_checkins
where user_id = 'linkedin|DFUJTWpo4O'
  and checkin_date = '2026-07-06'
  and time_window = 'evening';

insert into daily_checkins (
  user_id,
  checkin_date,
  timestamp,
  time_window,
  outcome,
  skipped,
  clarity_level,
  confidence_level,
  emotion_level,
  pressure_level,
  regulation_level
)
values (
  'linkedin|DFUJTWpo4O',
  '2026-07-06',
  '2026-07-06T18:30:00+05:30',
  'evening',
  'centered',
  false,
  4,
  4,
  4,
  2,
  4
);
```

### 6.3 Insert calendar events

Important:

- `is_all_day` exists and should be filled explicitly
- `external_id` must be unique enough for your test

```sql
delete from calendar_events
where user_id = 'linkedin|DFUJTWpo4O'
  and external_id like 'manual-test-2026-07-06-%';

insert into calendar_events (
  user_id,
  external_id,
  title,
  start_time,
  end_time,
  provider,
  is_all_day,
  is_organizer,
  is_recurring,
  attendees_count,
  event_metadata
)
values
  (
    'linkedin|DFUJTWpo4O',
    'manual-test-2026-07-06-strategy',
    'Strategy Review Test',
    '2026-07-06T17:30:00+05:30',
    '2026-07-06T18:30:00+05:30',
    'manual_test',
    false,
    true,
    false,
    5,
    '{"source":"manual_test","kind":"meeting"}'::jsonb
  ),
  (
    'linkedin|DFUJTWpo4O',
    'manual-test-2026-07-06-board',
    'Board Prep Test',
    '2026-07-06T20:00:00+05:30',
    '2026-07-06T21:00:00+05:30',
    'manual_test',
    false,
    true,
    false,
    6,
    '{"source":"manual_test","kind":"high_stakes"}'::jsonb
  );
```

## 7. Trigger the Cards

If you are testing the whole pipeline, trigger:

```json
POST /functions/v1/build-executive-home-cards
{
  "mode": "manual_refresh",
  "localDate": "2026-07-06",
  "window": "evening"
}
```

Expected happy-path response shape:

- `mrsStatus = "ready"`
- `briefStatus = "ready"`
- `planStatus = "ready"`

## 8. DB Check Queries

Run these in order.

### 8.1 Check raw inputs

```sql
select
  summary_date,
  hrv,
  resting_heart_rate,
  sleep_score,
  total_sleep_minutes
from wearable_data
where user_id = 'linkedin|DFUJTWpo4O'
order by summary_date desc
limit 10;
```

```sql
select
  checkin_date,
  time_window,
  timestamp,
  outcome,
  clarity_level,
  confidence_level,
  emotion_level,
  pressure_level,
  regulation_level,
  energy_balance
from daily_checkins
where user_id = 'linkedin|DFUJTWpo4O'
  and checkin_date = '2026-07-06'
order by timestamp desc;
```

```sql
select
  title,
  start_time,
  end_time,
  is_all_day,
  attendees_count,
  is_organizer
from calendar_events
where user_id = 'linkedin|DFUJTWpo4O'
  and start_time::date = '2026-07-06'
order by start_time;
```

### 8.2 Check MRS snapshot

This is the first real proof that MRS worked.

```sql
select
  local_date,
  mrs_window,
  inner_score,
  inner_tier,
  readiness_score_baseline,
  readiness_score_refined,
  readiness_state,
  tier_displayed,
  updated_at,
  weight_provenance
from daily_context_snapshot
where user_id = 'linkedin|DFUJTWpo4O'
  and local_date = '2026-07-06'
order by updated_at desc;
```

What you want:

- `inner_score` is numeric
- `readiness_score_baseline` is numeric
- `readiness_state` is `baseline` or `refined`
- not `awaiting`

### 8.3 Check Brief snapshot

```sql
select
  local_date,
  time_window,
  brief_source,
  score,
  tier,
  baseline_score,
  refined_score,
  baseline_state,
  refined_state,
  phrase,
  body_text,
  updated_at,
  llm_fallback_reason
from brief_snapshots
where user_id = 'linkedin|DFUJTWpo4O'
  and local_date = '2026-07-06'
order by updated_at desc;
```

What you want:

- `score` matches the MRS snapshot for the same window
- if LLM copy failed, `phrase` / `body_text` may be null
- but `score` should still remain populated if score payload is valid

### 8.4 Check Plan snapshot

```sql
select
  plan_date,
  mrs_window,
  status,
  generated_at,
  jsonb_array_length(coalesce(horizon_modules, '[]'::jsonb)) as horizon_module_count,
  jsonb_array_length(coalesce(priorities, '[]'::jsonb)) as priority_count,
  recommended_practice_ids
from mastery_plan_snapshots
where user_id = 'linkedin|DFUJTWpo4O'
  and plan_date = '2026-07-06'
order by generated_at desc;
```

What you want:

- `status = 'ready'`
- `horizon_module_count > 0`
- `priority_count > 0`

## 9. What Each Card Really Uses in the UI

### Mental Readiness Score

Main DB source used by UI:

- `daily_context_snapshot`

If you have a mismatch between API response and UI, check this table first.

### Performance Readiness Brief

Main DB source used by UI:

- `brief_snapshots`

But the component can also merge in live `useOuterReadiness` data. So if UI looks wrong, compare:

1. `brief_snapshots`
2. live `compute-outer-readiness` response

### Today's Performance Priorities

Main DB source used by UI:

- `mastery_plan_snapshots`

But it is gated by readiness state, so also check:

1. `daily_context_snapshot`
2. `brief_snapshots`
3. then `mastery_plan_snapshots`

## 10. Fast Debug Rules

### If MRS is blank

Check:

1. `wearable_data` exists for recent days
2. `daily_checkins` exists for that date/window if you expect refined score
3. `daily_context_snapshot` has a row for that `local_date` + `mrs_window`

### If Brief is blank but MRS exists

Check:

1. `brief_snapshots` row exists for same date/window
2. `brief_snapshots.score` matches `daily_context_snapshot.inner_score`
3. if `phrase/body_text` are null, confirm whether copy-only awaiting is intended

### If Plan is blank

Check:

1. `daily_context_snapshot.readiness_state`
2. `daily_context_snapshot.inner_score`
3. `brief_snapshots.score`
4. `mastery_plan_snapshots.status`
5. whether `generate-mastery-plan` returned awaiting-signals envelope

## 11. Clean Reset Queries

Use these when you want to retest the same date/window from scratch.

```sql
delete from mastery_plan_snapshots
where user_id = 'linkedin|DFUJTWpo4O'
  and plan_date = '2026-07-06';
```

```sql
delete from brief_snapshots
where user_id = 'linkedin|DFUJTWpo4O'
  and local_date = '2026-07-06';
```

```sql
delete from daily_context_snapshot
where user_id = 'linkedin|DFUJTWpo4O'
  and local_date = '2026-07-06';
```

## 12. Best Practical Test Sequence

Use this exact sequence:

1. Insert 10 days of `wearable_data`
2. Insert 1 `daily_checkins` row for the target window
3. Insert 1 to 3 `calendar_events`
4. Call `build-executive-home-cards`
5. Check `daily_context_snapshot`
6. Check `brief_snapshots`
7. Check `mastery_plan_snapshots`
8. Open UI and compare

That order is the fastest way to separate:

- bad test data
- backend generation issues
- snapshot persistence issues
- UI display issues

