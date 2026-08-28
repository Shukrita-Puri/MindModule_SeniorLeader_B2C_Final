# Restore atomic MRS, Brief, and Plan refresh parity

## Confirmed diagnosis

For the affected morning window on 28 Aug:

- The latest manual refresh completed successfully at 10:21 UTC with `mrs_status=ready`, `brief_status=ready`, and `plan_status=ready`. The backend orchestration and morning signals did not fail.
- The database still has a valid MRS baseline score of 30 with fresh score-bearing signal pills, and the Plan snapshot was rewritten as `ready` at 10:21 UTC.
- The newest Brief row written by production is still tagged `v7.5-four-beat-deterministic`, while the frontend reader now requests only `v7.7-calendar-load-honesty`. The reader therefore receives no matching Brief row and falls into its awaiting presentation even though MRS and Plan are ready.
- After a successful orchestrated refresh, `useExecutiveHomeCardsRefresh` calls `clearOuterReadinessCache()`. That helper does more than clear memory: it sets a session `prb-force-refresh` flag. This re-enables a second live `compute-outer-readiness` request on all three mounted cards, bypassing the intended snapshot-only home flow. During that second request, MRS and Plan can show loaders and Brief can independently resolve to awaiting.
- Brief also has an additional `isTrueAwaitingBrief`/copy-readiness gate layered on top of the shared `isMrsVisible` gate. Plan stops trusting stale outer-Brief awaiting state once MRS is ready; Brief does not. This is the direct parity violation.

## Implementation

1. **Make manual refresh one atomic backend operation**
   - Keep `build-executive-home-cards` as the only regeneration call made by the refresh button.
   - After it succeeds, invalidate and reread the three persisted snapshots only.
   - Do not set the `prb-force-refresh` flag and do not launch a second client-side `compute-outer-readiness` request.
   - Split ordinary cache eviction from “force a live compute” so check-in/integration flows can retain their existing behavior without the refresh button inheriting it.

2. **Keep the last complete three-card set visible while refreshing**
   - MRS, Brief, and Plan keep rendering their current-window snapshots while the orchestrator runs and while snapshot queries refetch.
   - Show only the existing subtle “Updating” treatment; do not replace formed cards with scripted loaders.
   - Swap to the refreshed set only after the refresh response is successful and all three snapshot reads have settled.
   - On refresh failure, retain the previous complete set; never downgrade any card to awaiting.

3. **Restore one shared readiness gate**
   - Treat current-window MRS visibility (`isMrsVisible`) as the canonical formed/awaiting decision for all three cards.
   - Plan continues to follow MRS.
   - Brief must not show “Awaiting signals” when MRS is formed. If MRS is formed but refreshed Brief copy is temporarily unavailable, retain the current-window last-good Brief while refetching; do not reinterpret a copy/read failure as missing signals.
   - Reserve the shared Awaiting Signals state for the real condition where the MRS snapshot is not renderable/awaiting.

4. **Fix the production Brief version mismatch**
   - Confirm the deployed Brief generator and snapshot reader both use `v7.7-calendar-load-honesty` from the shared version source.
   - Redeploy the generator with its shared dependency and verify that a manual refresh writes a v7.7 row before the frontend invalidates its Brief query.
   - Keep old rows as history; no database deletion or schema change.

5. **Preserve per-window browser caching correctly**
   - Keep the localStorage Brief cache scoped by user/date/window.
   - Do not clear the current Brief before regeneration, because that creates the visible awaiting gap.
   - After the refreshed v7.7 snapshot is read successfully, replace only the current user/date/window cache entry. Other days and windows remain untouched.

## Verification and launch safety

- Add regression coverage for: no second live compute after manual refresh; valid snapshots remain rendered while refetching; Brief cannot show awaiting when MRS is visible; current-window cache is replaced only after successful refreshed data; all three cards retain the previous set on refresh failure.
- Run the frontend suite plus the orchestrator/manual-refresh, snapshot-reader, deterministic Brief, validator, and golden-set backend suites.
- Deploy the Brief generator/shared version first, then the orchestrator/frontend refresh fix.
- On the affected account, verify one refresh produces exactly one `manual_refresh` run, all three statuses are ready, MRS remains 30 when signals are unchanged, Plan remains formed, Brief reads the v7.7 row, the calendar wording is signal-accurate, and no card shows a loader or false awaiting state.
- Repeat once on the second connected-calendar account and confirm Apple/Google deduplication does not alter the shared MRS gate.
