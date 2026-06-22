---
name: Weekly Plan Snapshots (Sunday → weekday memory)
description: public.weekly_plan_snapshots persists the Sunday Week Ahead priorities + optional selected_plan/user_edits per (user_id, local Mon week_start, source). Written by list-week-ahead-priorities, read by generate-mastery-plan for the current local week only.
type: architecture
---
**Table:** `public.weekly_plan_snapshots`
- Keyed by `(user_id, week_start_date, source='sunday_week_ahead')`.
- `week_start_date` is the **user's local Monday**; `week_end_date` is local Sunday.
- Fields: `priorities jsonb`, `selected_plan jsonb`, `user_edits jsonb`, `generated_at`, `updated_at`, `version`.
- RLS: owner select/insert/update on `auth.uid()::text = user_id`. Service role full access.

**Write path:** `supabase/functions/list-week-ahead-priorities/index.ts`
- GET upserts the generated priorities for the current local week (idempotent — repeated Sunday refreshes update the same row; no duplicates).
- POST `{ action: 'save', selected_plan?, user_edits? }` updates only the provided fields. Must NOT overwrite generated `priorities`.
- Logs: `[week_ahead.write.success]`, `[week_ahead.save.success]`.

**Read path:** `supabase/functions/generate-mastery-plan/index.ts` → `buildSharedContext`
- Loads ONLY the row for the current local Monday (`week_start_date = current weekStart`). Stale prior-week rows are ignored.
- Exposed as `SharedContext.weeklyPlanSnapshot` (nullable).
- Logs: `[week_ahead.read.hit]`, `[week_ahead.read.miss]`, `[week_ahead.read.error]`.

**Hard rule — advisory only:**
The snapshot may influence weekly framing / prep focus / themes. It must NOT hard-override:
- event selection (`selectJitCandidates`)
- relationship taxonomy or cancellation memory
- slot allocator / practice selector (`buildSlotContext`)
- signal-pill rendering
- awaiting-signals envelope

**Tests:**
- `supabase/functions/list-week-ahead-priorities/weekly_snapshot_test.ts`
- `supabase/functions/generate-mastery-plan/weekly_snapshot_read_test.ts`