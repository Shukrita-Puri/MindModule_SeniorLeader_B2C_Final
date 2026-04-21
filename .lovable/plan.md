

## Plan: Restore post–check-in Brief refresh (fix EF crash)

### Root cause (confirmed in edge logs + DB)

Edge function logs show, every evening request after the user checked in:

```
2026-04-21T18:06:43Z ERROR [compute-outer-readiness] Error: consecutiveLowDays is not defined
```

The function `getLeanOnWatchFor()` (line 1544) references three **free variables** that aren't in its parameter list:

- `consecutiveLowDays` (line 1682)
- `checkInOutcome` (line 1683)
- `hrvDeviation` (line 1684)

These are declared **deeper in the handler scope**, after the function is called at line 2040. The pre-check-in path skips the P6 branch (because `clarity === null && confidence === null` returns at line 1338), so it doesn't hit the bad reference. **The post-check-in path always hits it**, the handler throws, the client receives an error, and `useOuterReadiness` returns `null` → the Brief card falls back to its empty state ("NOT YET ASSESSED / Begin with your check-in"), which is exactly what the screenshot shows for the evening window.

DB confirms: `daily_checkins` has the user's evening check-in (17:52 UTC, drained, clarity 4, confidence 4, sharpness 5) and `energy_balance = 42`, but **no `brief_snapshots` row exists for evening** — because the EF crashed before the snapshot upsert at line 3925 could run.

This also means the sidebar "Past briefs" feature continues to work safely (we're only fixing the live-brief generation path; historical snapshots are read by `brief-by-id`).

### Fix

Single, minimal edit to `supabase/functions/compute-outer-readiness/index.ts`:

1. **Add the three missing parameters to `getLeanOnWatchFor`'s signature** (so they're explicit, not implicit-global):

```ts
function getLeanOnWatchFor(
  tier: EnergyTier,
  archetype: string | null,
  clarity: number | null,
  confidence: number | null,
  coachStrength: string | null,
  coachGrowth: string | null,
  coachInsightCreatedAt: string | null,
  checkInCountTotal: number,
  typicalDOWOutcome: string | null,
  hrvEventCorrelation: string | null,
  scoreTrajectory7d: string | null,
  dayOfWeek: number,
  // NEW — explicit pass-through to fix ReferenceError
  consecutiveLowDays: number,
  checkInOutcome: string | null,
  hrvDeviation: number | null,
): LeanOnWatchForResult { … }
```

2. **At the call site (line 2040)**, compute `consecutiveLowDays` once from `recentCheckIns` (which is already in scope) and pass it along with the existing in-scope `checkInOutcome` and `hrvDeviation`:

```ts
let consecutiveLowDaysEarly = 0;
for (const c of recentCheckIns) {
  if ((c as any).energy_balance != null && (c as any).energy_balance < 50) consecutiveLowDaysEarly++;
  else break;
}

const leanOnResult = getLeanOnWatchFor(
  safeTier, serverArchetype, clarityLevel, confidenceLevel,
  coachStrength, coachGrowth, coachInsightCreatedAt, checkInCountTotal,
  typicalDOWOutcome, hrvEventCorrelation, scoreTrajectory7d, dayOfWeek,
  consecutiveLowDaysEarly,
  checkInOutcome ?? null,
  typeof hrvDeviation === 'number' ? hrvDeviation : null,
);
```

3. **Update the inner reference at line 1682** to use the parameter (no other changes needed inside the function body — `checkInOutcome` and `hrvDeviation` were already received via the `context` object but the bug was specifically the `consecutiveLowDays` free reference; making all three explicit removes ambiguity and prevents the same class of regression).

4. **Defense-in-depth: wrap the response-assembly block in try/catch with a deterministic fallback brief** so a future free-variable bug never blanks the dashboard again. On catch:
   - Log structured error (`[compute-outer-readiness] FATAL`) per the Fatal Error Logging standard.
   - Return a deterministic brief built from `safeTier` + `checkInOutcome` (uses existing `tierFallbacks` map already present in the file).
   - Set `briefSource: 'deterministic'` so the client labels it correctly.

### Why this is safe for the sidebar / historical briefs

- We only fix the **live brief generation** path. The `brief_snapshots` table, `brief-by-id`, `brief-history`, and `HistoricalBriefOverlay` are not touched.
- Existing snapshots (afternoon, morning) remain readable in the sidebar exactly as today.
- The fix means the **evening snapshot will start being written** (currently missing because the upsert at line 3925 is unreachable after the throw).
- Server-side dedupe + 6-hour engagement guard from the previous patch remains in effect, so when the user refreshes, the new evening brief surfaces once in the sidebar — no duplicate spam.

### Verification

1. Tail `compute-outer-readiness` logs after deploy → no more `consecutiveLowDays is not defined` errors.
2. `SELECT … FROM brief_snapshots WHERE local_date='2026-04-21' AND time_window='evening'` returns one row for the user.
3. Refresh `/executive-home` → Brief card renders the evening phrase + body + lean-on + watch-for + score (no longer "NOT YET ASSESSED").
4. Sidebar "Recent" shows the new evening brief appended once under TODAY without disturbing the afternoon/morning entries.
5. Click the new evening row → `HistoricalBriefOverlay` opens with the freshly-written snapshot.
6. Force-error simulation (temporarily throw inside the response block) → fallback deterministic brief renders instead of an empty card.

### Files touched

| File | Change |
|---|---|
| `supabase/functions/compute-outer-readiness/index.ts` | Add 3 explicit params to `getLeanOnWatchFor`; pass them at the call site (compute `consecutiveLowDays` from `recentCheckIns`); wrap response-assembly in try/catch with deterministic fallback + fatal logging |

### Out of scope

- Pre-check-in empty state copy ("Begin with your check-in.") — already correct
- Historical brief overlay UX — already shipped
- Sidebar tooltip / Sharp/Clear/Confident labels — already shipped
- Any change to `brief_snapshots` schema or to how snapshots are read

