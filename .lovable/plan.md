## What's actually wrong

I traced all three reported issues against the live code, DB and a sample row pull.

### Issue 1 — Dial "not visible"

The half-dial component (`src/components/home/mrs/WeeklyDeltaDial.tsx`) renders, but its **track stroke is pure white over 0.05 alpha on a near-white background**:

```
<linearGradient id="weekly-track">
  <stop offset="0%"  stopColor="hsl(0 0% 100%)" stopOpacity="0.55"/>
  <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0.05"/>
</linearGradient>
```

That's why the screenshot shows only the LOWER / CURRENT / HIGHER labels and the centre badge — the arc itself is invisible against the page surface. The "glass edge" border strokes are also `hsl(0 0% 100% / 0.55)` and `hsl(var(--foreground)/0.06)`, both effectively invisible.

Fix: swap the track to a visible neutral token so the arc shape always reads:
- Track stroke → `hsl(var(--foreground) / 0.10)` solid (drop the gradient, keep `strokeLinecap="round"`).
- Outer edge → `hsl(var(--foreground) / 0.18)` at 1px.
- Inner shadow filter → keep as a subtle depth cue at 0.10 alpha.

No layout, no resize, no behavior change — purely making the arc readable.

### Issue 2 — Dial "not populating"

The pipeline itself is correct (verified end‑to‑end against the DB):

- Hook `src/hooks/useWeeklyMrsDelta.ts` posts `GET_WEEKLY_DELTA` with `thisMonday`, `lastMonday`, `lastSunday`, `today`.
- Function reads `brief_snapshots`, latest row per `local_date`, maps `baseline ?? refined`, returns `{ baselineDelta, refinedDelta, todayState }`.
- DB has 18 rows this week and 5 last week for the active user → `refinedDelta` resolves cleanly.

Two real defects suppress the value on screen:

a. `useWeeklyMrsDelta` swallows every failure (`catch { return { delta: null, mode: 'baseline', label: null } }`). A 401 from an expiring Auth0 token or a one‑off function error becomes a silent "Building your weekly trend". Fix:
- Log the error to `console.warn` with the action name and status.
- Surface the network state via React Query (`retry: 1`, `staleTime: 5min` already set) instead of trapping inside `queryFn`.

b. `MrsPage` calls the hook with no `userId` gating. When `useAuth().user` is briefly `null` after a refresh, the hook fires anyway, the function returns 401, and the dial flips to the empty fallback. Fix: add `enabled: !!userId` to the query.

### Issue 3 — Mode mirrors today's state (refined vs baseline)

This is already implemented but needs a small correction. Function returns `todayState = refined_state ?? baseline_state ?? 'baseline'`. Hook then does:

```
mode = todayState === 'refined' && refinedDelta !== null ? 'refined' : 'baseline';
delta = mode === 'refined' ? refinedDelta : baselineDelta;
```

Edge case: a checked‑in user whose last week is purely historical (`refined_score` only, `baseline_score` NULL) gets `refinedDelta` non‑null because the function maps `baseline ?? refined` for the baseline series, but the dial label still shows "baseline" once `refinedDelta` is null for any reason. Fix the hook so the displayed mode follows `todayState` itself, and the delta then prefers the matching series with a single fallback:

```
mode = todayState === 'refined' ? 'refined' : 'baseline';
delta = (mode === 'refined' ? refinedDelta : baselineDelta) ?? baselineDelta ?? refinedDelta;
```

That keeps the rule "if the user has checked in today, the dial shows refined trend; otherwise baseline" without dropping to "—" when one side of the comparison is missing.

### Issue 4 — Validate the baseline + refined split plan

I checked it against the live schema and code. Everything in the original plan is in place:

- Columns renamed to `refined_score / refined_tier / refined_phrase / refined_body_text / refined_lean_on(_source) / refined_watch_for(_source) / refined_signal_pills`.
- `baseline_*` parallel columns + `baseline_state` + `refined_state` added.
- CHECK constraint `refined_score_within_baseline_range` present and enforcing ±15.
- Index `brief_snapshots_user_date_scores_idx` present.
- Trigger `brief_snapshots_user_update_guard` rewritten with the new column list (verified in `db-functions` definition).
- `compute-outer-readiness` writes `refined_*` on check-in path and `baseline_*` on the baseline path with the matching `*_state` literal.
- Readers (`brief-by-id`, `brief-history`, `cause-effect-engine`, `user-events`, `mental-fitness-scores`) coalesce `refined_* ?? baseline_*`.
- `useWeeklyMrsDelta` already sources from `brief_snapshots` via the function (not `daily_context_snapshot`).
- Memory note `mem://backend/database/brief-snapshots-two-state-schema` exists.

One residual gap worth closing in this turn:

- `src/hooks/useBriefSnapshot.ts` still types only the legacy keys (`score`, `tier`, `phrase`, `body_text`, `lean_on*`, `watch_for*`, `signal_pills`) and does not expose `baseline_*` / `refined_*` / `*_state`. The server already returns the coalesced legacy keys, so call sites compile, but new readers cannot see which state the brief is in. Extend the interface with `refined_*` + `baseline_*` + `refined_state` + `baseline_state` fields (all nullable) so consumers like the dial label and Insights can branch on state without re-fetching.

## Files to edit (UI/hook only — no schema or write-path changes)

1. `src/components/home/mrs/WeeklyDeltaDial.tsx` — track + edge stroke colors so the arc is visible.
2. `src/hooks/useWeeklyMrsDelta.ts` — log errors instead of swallowing; gate on `userId`; pick `mode` from `todayState` with a single fallback when one side is missing.
3. `src/components/home/mrs/MrsPage.tsx` — minor: keep using `weekly.data?.mode` for the readiness state label (already correct; verify).
4. `src/hooks/useBriefSnapshot.ts` — extend the `BriefSnapshotRecord` interface with the new `refined_*` / `baseline_*` / `*_state` fields.

No edge function redeploys, no migrations, no scoring changes — strictly the dial visibility, the empty‑state regression, and the back‑compat interface gap from §2 of the original plan.

## Out of scope

- No changes to `compute-outer-readiness`, `mental-fitness-scores`, or any other edge function logic.
- No DB migration; constraint, index, trigger, and column set are already correct.
- No visual redesign of `MrsGauge` or the page layout.
