Confirmed: `useMrsSnapshot` already returns the `useQuery` result directly, so `isLoading` / `isFetching` are already destructurable. No return-shape change. The only edit to that file is the one-line `staleTime` bump.

## Scope

Pass 1 = Changes A, B, C plus the stale-time table. Change D (removing the Brief-card `shouldPreferMrsSnapshot` override) is held until A–C are stable. Changes E and F (edge function + energyStateEngine) are out of scope.

## What gets changed

### 1. Stale times → 15 minutes (matches the 15-min cron cadence)
- `src/hooks/useMrsSnapshot.ts` — `staleTime: 60 * 1000` → `15 * 60 * 1000` (one line; nothing else in this file changes)
- `src/hooks/useCurrentBriefSnapshot.ts` (line 193) — `5 * 60 * 1000` → `15 * 60 * 1000`
- `src/hooks/useOuterReadiness.ts` (line 967) — `5 * 60 * 1000` → `15 * 60 * 1000`

Manual refresh is unaffected — it invalidates the queries explicitly.

### 2. Loading state (`src/components/home/mrs/MrsPage.tsx` only)
- Destructure `isLoading` from the existing `useMrsSnapshot()` return.
- Derive `showScoreLoader = (mrsLoading && !snapshotRenderable && !hasScore) || (refreshCards.isPending && !hasScore)`.
- While `showScoreLoader` is true, render the card shell (eyebrow + time/date label) with `EngravedLoader` in place of the gauge and one-liner block, instead of the `—` gauge. Keep the "Take assessment" tab and weekly dial mounted so layout does not collapse.
- Once a score exists, render exactly as today. Never swap a rendered number back to the loader.

No other file is touched.

## Deferred (not in this pass)

- **D** — remove the `shouldPreferMrsSnapshot` override at `DecisionReadinessBrief.tsx:2183-2202`. `canonicalMrsScore` (line 1997) already prefers the MRS snapshot inside the snapshot overlay, so the later override is redundant when a brief snapshot is renderable — but not when only the MRS snapshot exists. That case needs its own verified pass.
- **E / F** — server-side score read-first and disabling the client compute path.

## Verification

- Typecheck + existing vitest suites (`snapshotContractGuards`, `useOuterReadiness` tests).
- Playwright load of `/` at mobile viewport: capture the MRS card during loading and after the score resolves; confirm no `—` flash and no score change within the first 60s.
