# Check-in → MRS → Brief propagation audit

Subject: shukrita@mindmodule.me, local date 2026-08-28, window `evening` (check-ins written 00:53 and 00:54 London).

## Point 1 — What triggers MRS recompute after a check-in write?

A trigger exists and is explicit (not realtime, not polling).

- `src/pages/DailyCheckIn.tsx`, `handleSubmit`, lines 296–317: after `saveCheckin` succeeds it invokes the `build-executive-home-cards` edge function with `mode: 'checkin_save'`, `localDate`, `window`, `checkinId`.
- Lines 332–341: `queryClient.removeQueries` + `invalidateQueries` for `mrs-snapshot`, `current-brief-snapshot`, `mastery-plan-snapshot`, `mrs-weekly-delta`.
- Secondary safety nets: `useMrsSnapshot` (`src/hooks/useMrsSnapshot.ts:109–111`) refetches on mount, on focus, and every 3 minutes.

Point 1 is not broken.

## Point 2 — Does the trigger fire after submission?

Yes. `executive_home_card_runs` shows four `mode: manual_refresh` runs for `local_date=2026-08-28`, window `evening`, at 23:54:24, 23:54:45, 23:55:05 and 00:13:42 UTC — i.e. immediately after each check-in write, all `status: success`. `normalizeBuildMode` maps `checkin_save` → `manual_refresh` (`build-executive-home-cards/index.ts:58`).

Point 2 is not broken.

## Point 3 — Does the recompute see the check-in data?

Yes. `latestCheckin` (`build-executive-home-cards/index.ts:301–311`) filters `user_id`, `checkin_date = localDate`, `time_window = window`, newest first. The stored row is `checkin_date = 2026-08-28`, `time_window = evening`, matching the run's `localDate/window` exactly (timezone resolved as `Europe/London`, so no UTC/local date drift). The four Mind levels are forwarded to `compute-inner-readiness` (lines 809–814) and to `compute-outer-readiness` (lines 928–933).

Point 3 is not broken. The check-in data reaches the engine.

## Point 4 — Is the recompute producing and persisting an updated MRS? (BROKEN)

The runs all recorded `mrs_status: awaiting`, `plan_status: awaiting`, and every `brief_snapshots` row written for 2026-08-28 evening has `brief_source = awaiting`, `baseline_state = awaiting`, `score = null`.

Cause chain:

1. `compute-inner-readiness/index.ts:1015–1025` requires **both** pillars — a wearable sub-score AND a demand sub-score — before MRS can form: `score = bothPillarsMet ? … : null`, `mrsV4AwaitingSignals = !bothPillarsMet`.
2. The wearable pillar is fed only when `hasFreshWearable` is true (`build-executive-home-cards/index.ts:723–725`), and evening freshness allows **age 0 days only** (`_shared/signal-engine/signal-freshness.ts:54–56`, `maxWearableAgeDaysForWindow` returns 1 for morning, 0 otherwise).
3. Latest `wearable_data` row is `summary_date = 2026-08-27`. The HealthKit sync did run at 00:13 UTC on the 28th but, being ~13 minutes into the new local day, it had no 2026-08-28 day row to write. Age = 1 day → not fresh → every wearable sub-score unavailable → `wearablePillarMet = false`.
4. So MRS returns `readinessState: 'awaiting'`, `score: null`. Even a perfect check-in cannot lift it: `compute-inner-readiness/index.ts:1090–1095` explicitly forces `refined → baseline` (and the awaiting path nulls the score) when Stage 1 is absent. This is intentional product logic, but it means a check-in made shortly after midnight can never move the number.
5. Because MRS came back awaiting, `mrsIsReady = false` (`build-executive-home-cards/index.ts:862–870`), so the Brief call receives `innerReadinessState: 'awaiting'` and writes an awaiting brief. That is the "connect your wearable and calendar" copy.
6. Separately, `daily_context_snapshot` for 2026-08-28 evening still holds the **pre-check-in** row (`created_at 23:52:43`, `inner_score 24`, `readiness_state baseline`, provenance including `eveningPhysioRead`). The preserve-existing guard in `compute-outer-readiness/index.ts:10075–10125` keeps a previously ready row rather than overwriting it with the awaiting run. That frozen row is exactly what the MRS card is still rendering — hence "early signal — check in to sharpen" that never changes.

So the system is in a split state: MRS card reads a stale preserved snapshot; the Brief reads a fresh awaiting snapshot. Both are "correct" per their own source, and neither reflects the new check-in.

## Point 5 — Is the Brief reading a stale MRS value?

No. `DecisionReadinessBrief.tsx:2177` uses the shared `isMrsVisible(briefMrsSnapshot, outerBrief)` gate against the same `useMrsSnapshot` query that the MRS card uses, and the awaiting copy is driven by `awaitingSignalsRaw` (line 2233) sourced from the freshly refetched brief snapshot. Both queries are invalidated by the check-in handler. The Brief is showing awaiting because the backend genuinely wrote awaiting, not because of a cache.

Point 5 is not broken.

## What is actually broken

Only Point 4, in two distinct parts, in the order they occur:

**4a — Wearable pillar starves immediately after local midnight.** Evening requires a same-local-day wearable row. Between 00:00 and the first sync that produces a row for the new day, `wearablePillarMet` is false and MRS collapses to awaiting for the whole evening window, regardless of the check-in.

**4b — Snapshot divergence.** When 4a happens, the awaiting run does not clear or supersede the earlier ready `daily_context_snapshot` row, so the MRS card shows a frozen number and stale "early signal" copy while the Brief shows awaiting. The two cards contradict each other.

## Fix plan

### Fix 1 — Early-morning wearable carry-forward (addresses 4a)

- **What:** treat the previous local day's wearable row as pillar-satisfying during the overnight portion of the evening window (local 00:00–04:59), which is the same calendar-day rollover the app's own window definition (evening = 18:00–04:59) already spans. Implement as a window-aware exception inside `maxWearableAgeDaysForWindow` / `resolveSignalFreshness` (accept age ≤ 1 when local hour < 5), so pills, MRS and the Brief all inherit one rule.
- **Files:** `supabase/functions/_shared/signal-engine/signal-freshness.ts` (`maxWearableAgeDaysForWindow`, `resolveSignalFreshness`), and the age computation in `supabase/functions/build-executive-home-cards/index.ts` (`buildForUser`, `hasFreshWearable`) which must pass local hour through.
- **Risk:** medium. It widens the freshness contract that several surfaces share; must not leak into the 18:00–23:59 part of evening, where a same-day row is genuinely expected.
- **Deployment:** edge functions — redeploy `build-executive-home-cards`, `compute-inner-readiness`, `compute-outer-readiness` (all consume the shared module).

### Fix 2 — Snapshot consistency on awaiting runs (addresses 4b)

- **What:** when a run resolves to awaiting for a window that already holds a ready row, stop presenting two truths. Preferred: keep the preserved score but stamp the row so the MRS card knows it is carried forward and not re-evaluated by this check-in, and make the Brief gate follow the same preserved row instead of the awaiting brief. Alternative, if the product prefers honesty over continuity: allow the awaiting run to supersede.
- **Files:** `supabase/functions/compute-outer-readiness/index.ts` (preserve-existing block, ~lines 10075–10190), `src/hooks/useMrsSnapshot.ts` (`isRenderable` / status derivation), `src/components/home/DecisionReadinessBrief.tsx` (gate at line 2177).
- **Risk:** medium. This block was added deliberately to stop MRS oscillation; changing it can reintroduce score flapping between Home, MrsPage and the Brief.
- **Deployment:** edge function redeploy (`compute-outer-readiness`) plus a frontend change.

### Fix 3 — Honest copy when Stage 1 is missing (low risk, optional but recommended)

- **What:** when the check-in is recorded but MRS cannot form for lack of a wearable row, say so — "check-in recorded; readiness will sharpen once today's wearable data syncs" — instead of "check in to sharpen", which asks for something the user just did.
- **Files:** `src/components/home/AwaitingSignalsNotice.tsx` and the MRS card copy in `src/components/home/mrs/MrsPage.tsx`.
- **Risk:** low. Copy only.
- **Deployment:** frontend only.

## Order and confirmation tests

1. **Fix 1 first.** It is the root cause; Fix 2's symptom may not recur once MRS forms.
   - *Confirm:* run a check-in between 00:00 and 04:59 local. In the DB, the newest `executive_home_card_runs` row for that window shows `mrs_status: ready`; `daily_context_snapshot` for that `local_date/mrs_window` shows `readiness_state = 'refined'` with a non-null `readiness_score_refined` and an `updated_at` after the check-in. In the UI, the MRS number moves and the "early signal" label is replaced.
2. **Fix 2 second.** Verify with an intentionally awaiting case (no wearable at all).
   - *Confirm:* `daily_context_snapshot` and the newest `brief_snapshots` row agree — either both awaiting, or both carrying the preserved score. In the UI, MRS and the Brief never show a number and an awaiting notice at the same time.
3. **Fix 3 last.**
   - *Confirm:* after a check-in with no wearable row, the notice names the wearable as the missing input and does not ask for another check-in.

No change to the check-in submission flow is proposed at any step.
