## Goal

Move Executive Home to a **cron-written, snapshot-read** model. Homepage never triggers live generation. MRS + PRB are built by cron 3×/day (morning, afternoon, evening). Plan is built by cron once/day in the morning slot and reused for afternoon/evening. All intelligence (scoring, LLM, ranking) stays exactly as-is — we only change *when* generation runs and *what* the UI reads.

## Approach for Plan day-scoping

Recommend the **minimal-change path**:
- Keep `mastery_plan_snapshots` keyed by `(user_id, plan_date, mrs_window)`.
- Cron only writes the `morning` row.
- A new shared helper `resolveCanonicalPlanSnapshot(userId, planDate)` returns the morning row for that day regardless of current window.
- Structure the helper + `get-mastery-plan-snapshot` response so switching to a truly day-scoped row later is a one-line change.

## Changes

### 1. Cron orchestrator — `supabase/functions/build-executive-home-cards/index.ts`
- In `buildForUser`, gate the Plan step behind `window === 'morning'`.
  - Afternoon/evening: set `planStatus = 'skipped_non_morning_window'`, do not call `generate-mastery-plan`.
- Update `scheduler.ts` `buildSequence` config comment/log to reflect: morning = mrs+brief+plan, afternoon/evening = mrs+brief.
- Structured log per user/window: `{ window, built: [...], skipped: [...] }`.

### 2. Plan persistence guarantees — `supabase/functions/generate-mastery-plan/index.ts`
- Keep the earlier fix (never overwrite a valid morning plan with an empty/awaiting later run):
  - Persist unconditionally on morning success.
  - On any non-morning invocation (manual/admin only), refuse to overwrite an existing `ready` morning row for the same `plan_date`.
- Keep `[mastery-plan-snapshot]` logs (persist-start, upsert-success/failure, early-return with reason).

### 3. Snapshot reader for Plan — `supabase/functions/get-mastery-plan-snapshot/index.ts`
- Accept `planDate` (and ignore `mrsWindow` for resolution purposes, but still echo it back).
- New internal helper `resolveCanonicalPlanSnapshot(db, userId, planDate)`:
  1. Try `mrs_window = 'morning'` for that date.
  2. (Future) fall through to a day-scoped row.
- Return `{ data, source: { canonicalWindow: 'morning', requestedWindow } }`.
- Log requested vs canonical window and found/missing.

### 4. Homepage read-only — client
- `src/components/home/TodayThreePriorities.tsx`
  - Remove the on-mount `supabase.functions.invoke('generate-mastery-plan', …)` path from the normal render flow.
  - Data source becomes `useMasteryPlanSnapshot` only; if snapshot missing, render the existing preparing/awaiting state.
  - Keep the manual/admin "force refresh" button wired to the existing invoke path, but behind an explicit user action (not auto).
- `src/hooks/useMasteryPlanSnapshot.ts`
  - Call `get-mastery-plan-snapshot` with `planDate` only; treat the canonical morning row as the day's plan.
  - Log `[plan-snapshot][render] source=snapshot canonicalWindow=morning requestedWindow=<w> found=<bool>`.
- `src/components/home/DecisionReadinessBrief.tsx` + `src/hooks/useOuterReadiness.ts` / `useCurrentBriefSnapshot.ts`
  - Homepage path: read `brief_snapshots` via `get-current-brief-snapshot` only. Do NOT call `compute-outer-readiness` on mount.
  - If snapshot missing for `(userId, localDate, timeWindow)`, show existing awaiting/preparing UI. Do not silently generate.
  - Keep manual refresh (pull-to-refresh / admin) as a separately-invoked path.
  - Log `[PRB][render] source=snapshot localDate=… timeWindow=…`.
- `src/hooks/useMrsSnapshot.ts` / MRS card
  - Already snapshot-read via `get-mrs-snapshot`. Confirm no live `compute-inner-readiness` is invoked from normal home render; if any remains, gate it behind manual refresh.
  - Log `[MRS][render] source=snapshot`.

### 5. Feature flag / staged rollout
- Add `VITE_HOME_SNAPSHOT_ONLY` (default `true`) checked in the three card consumers.
  - `true` (default): read-only behavior above.
  - `false`: legacy live-generation fallback (kept only for local debugging and admin tools).
- Admin/debug "regenerate" buttons always bypass the flag and call the edge functions directly.

### 6. Logging summary
| Point | Log |
| --- | --- |
| Cron per user/window | `[exec-home-cron] window=… built=[mrs,brief(,plan)] skipped=[…]` |
| Plan persist | `[mastery-plan-snapshot] upsert-success id=… priorities=N modules=M` |
| Plan snapshot read | `[get-mastery-plan-snapshot] requested=<w> canonical=morning found=<bool>` |
| PRB snapshot read | `[get-current-brief-snapshot] localDate=… timeWindow=… found=<bool>` |
| UI render source | `[MRS][render] source=snapshot`, `[PRB][render] source=snapshot`, `[plan-snapshot][render] source=snapshot canonicalWindow=morning` |

## Acceptance (mapped to spec)
1. Home load makes zero calls to `compute-inner-readiness`, `compute-outer-readiness`, or `generate-mastery-plan`.
2. Morning cron writes MRS + PRB + Plan snapshots.
3. Afternoon/evening cron writes MRS + PRB only; Plan row untouched.
4. Plan card renders the same morning plan across all 3 windows via `resolveCanonicalPlanSnapshot`.
5. Missing snapshots render the existing awaiting/preparing UI, never trigger live generation.
6. All existing scoring, brief validation, and plan ranking code paths are unchanged.

## Files touched
- `supabase/functions/build-executive-home-cards/index.ts` (+ `scheduler.ts` comment)
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/get-mastery-plan-snapshot/index.ts`
- `src/components/home/TodayThreePriorities.tsx`
- `src/components/home/DecisionReadinessBrief.tsx`
- `src/hooks/useMasteryPlanSnapshot.ts`
- `src/hooks/useOuterReadiness.ts` / `src/hooks/useCurrentBriefSnapshot.ts`
- `src/hooks/useMrsSnapshot.ts` (verify only, gate any live call)
- New: `src/config/homeSnapshotMode.ts` (feature flag helper)
