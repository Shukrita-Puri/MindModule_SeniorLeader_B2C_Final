# brief_snapshots — baseline + refined split

Make `brief_snapshots` the canonical 2-state store for MRS v3. Rename today's columns (which are all refined-style outputs) to `refined_*`, add parallel `baseline_*` columns for State 1, and enforce the ±15 rule at the DB level. Historical 335 rows have no baseline and stay valid.

## 1. Migration

Single migration, in order:

### 1a. Rename existing → `refined_*`
- `score` → `refined_score`
- `tier` → `refined_tier`
- `phrase` → `refined_phrase`
- `body_text` → `refined_body_text`
- `lean_on` → `refined_lean_on`
- `lean_on_source` → `refined_lean_on_source`
- `watch_for` → `refined_watch_for`
- `watch_for_source` → `refined_watch_for_source`
- `signal_pills` → `refined_signal_pills`

Untouched: `payload_json`, `pillar_mode`, `wearable_snapshot`, `checkin_snapshot`, `daily_checkin_id`, `brief_source`, `driver`, `input_signature`, `prompt_version`, `llm_*`, `user_rating`, `feedback_text`.

### 1b. Add `baseline_*` + state columns
```sql
ALTER TABLE public.brief_snapshots
  ADD COLUMN baseline_score            int  NULL,
  ADD COLUMN baseline_tier             text NULL,
  ADD COLUMN baseline_phrase           text NULL,
  ADD COLUMN baseline_body_text        text NULL,
  ADD COLUMN baseline_lean_on          text NULL,
  ADD COLUMN baseline_lean_on_source   text NULL,
  ADD COLUMN baseline_watch_for        text NULL,
  ADD COLUMN baseline_watch_for_source text NULL,
  ADD COLUMN baseline_signal_pills     jsonb NULL,
  ADD COLUMN baseline_state            text NULL,   -- 'baseline' | 'cold-start' | NULL
  ADD COLUMN refined_state             text NULL;   -- 'refined'  | NULL
```
`pillar_mode` stays read-only legacy; new code reads/writes the two `*_state` columns.

### 1c. ±15 constraint (DB-level guarantee)
```sql
ALTER TABLE public.brief_snapshots
  ADD CONSTRAINT refined_score_within_baseline_range
  CHECK (
    baseline_score IS NULL
    OR refined_score IS NULL
    OR refined_score BETWEEN baseline_score - 15 AND baseline_score + 15
  );
```
Historical 335 rows: `baseline_score IS NULL` → exempt. New rows with both → enforced.

### 1d. Index
```sql
CREATE INDEX brief_snapshots_user_date_scores_idx
  ON public.brief_snapshots (user_id, local_date DESC, time_window, refined_score, baseline_score);
```

### 1e. Update `brief_snapshots_user_update_guard` trigger
Rewrite the guard's column list to use the new names and include every new `baseline_*` + `*_state` column so users still cannot mutate them (only `user_rating`, `feedback_text` editable). Service role bypass unchanged.

### 1f. No data back-fill
Existing rows already hold refined_* values under the new names automatically. `baseline_*` left NULL by design.

## 2. Code updates (after migration approval)

Single sweep after types regen:

**Edge functions** — rename every `.score` / `.tier` / `.phrase` / `.body_text` / `.lean_on*` / `.watch_for*` / `.signal_pills` reference to `refined_*` in:
- `compute-outer-readiness/index.ts` — writes refined; add `refined_state='refined'` on check-in path; on baseline-only path write `baseline_*` columns + `baseline_state`
- `compute-inner-readiness/index.ts`
- `brief-by-id/index.ts`, `brief-history/index.ts`, `user-events/index.ts`, `cause-effect-engine/index.ts`, `generate-mastery-plan/index.ts`
- `_shared/load-brief-behaviour-snapshot.ts`, `_shared/behaviour-snapshot.ts`, `_shared/signal-engine/types.ts`, `window-context-types.ts`

**Write contract** in `compute-outer-readiness`:
- Baseline compute path → INSERT/UPSERT `(user_id, local_date, time_window)` with `baseline_*` populated, `refined_*` NULL.
- Check-in path → UPDATE same row, set all `refined_*` + `refined_state='refined'`. Wrap in try/catch on `refined_score_within_baseline_range` (clamp to ±15 before write so it never throws; log if clamp fired).

**Client**
- `src/hooks/useBriefSnapshot.ts` — interface adds `baseline_*` + `refined_*`; back-compat helpers `score`/`tier`/`phrase`/`bodyText` resolve to `refined_* ?? baseline_*` so existing call sites keep working.
- `src/hooks/useWeeklyMrsDelta.ts` — switch source from `daily_context_snapshot` to `brief_snapshots`; daily value = `COALESCE(refined_score, baseline_score)`, latest row per `local_date`. Fixes the empty dial because all 335 historical rows become usable.
- `src/components/insights/InnerReadinessDial.tsx`, `LeadershipPatternsCard.tsx`, `src/components/home/TodayThreePriorities.tsx`, `src/pages/ExecutiveHome.tsx` — read `refined_* ?? baseline_*`.

## 3. Cleanup (separate, after the above lands)
- `inner_readiness_scores` (0 rows, no readers) → DROP in a follow-up migration.
- `mental_fitness_scores` untouched (legacy composite, distinct from MRS).
- `daily_context_snapshot` keeps its per-day orchestration role; `readiness_score_baseline/refined` mirror what's in `brief_snapshots` but `brief_snapshots` becomes the canonical audit-grade history.

## 4. Acceptance
- Migration runs; 335 rows preserved; constraint active.
- Inserting `(baseline=30, refined=50)` rejected; `(baseline=NULL, refined=75)` accepted; `(baseline=70, refined=80)` accepted.
- Weekly MRS dial renders real values across the historical range.
- `useBriefSnapshot` consumers still compile (back-compat getters).
- User update-guard still blocks tampering on every new column.
- New memory: `mem://backend/database/brief-snapshots-two-state-schema` documenting columns, constraint, write paths.

## 5. Out of scope
- No changes to scoring/MRS math, no LLM prompt changes, no UI redesign of brief/dial/gauge (the earlier MrsGauge / WeeklyDeltaDial visual polish stays as a separate item).
- No edits to `daily_checkins`, `wearable_data`, or any auth/storage schema.
