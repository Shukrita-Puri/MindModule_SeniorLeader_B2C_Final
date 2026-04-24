## Plan — fix root cause + remove offending copy (no UI vocabulary leak)

You're right: applying current-window awareness to the **Brief's** signal contract is the single fix that resolves the screenshot. The Plan side is already window-scoped (`compute-mastery-plan` line 2071: `.eq('time_window', timeOfDay)`), which is why the Plan shell is correctly empty. The Brief is **not** window-scoped, so it generates from the stale afternoon check-in, which then collapses the client's awaiting gate and lets `DailyRitual`'s legacy fallback line render.

The word "window" stays internal — never user-facing.

---

### Root cause (confirmed)

1. `src/utils/energyStateEngine.ts` (line 261) calls `fetchTodayCheckin` which returns the *latest* check-in row of the calendar day regardless of `time_window`.
2. That `outcome` is passed to `compute-outer-readiness` as `checkInOutcome`.
3. `compute-outer-readiness/index.ts:4062` does `const hasTodayCheckIn = !!checkInOutcome;` — **calendar-day scope, not time-window scope**.
4. Result: in the evening, an afternoon outcome makes `briefSignalContractMet = true`, `awaitingSignals = false`, brief renders narrative content from stale signal.
5. Client `TodayThreePriorities.tsx:330` gate `(briefAwaiting && !todayCheckin && !wearableFresh)` is false → falls through → fetches plan → plan correctly returns `awaitingSignals: true` + empty modules → component takes the "no horizonModules" branch → fires `onEmpty` → `<DailyRitual />` mounts on `/plan` → renders the legacy `"Your plan is being prepared. Pull down to refresh."` line.

This single contract mismatch produces the entire visible defect.

---

### Change 1 — Server-side window-scoped signal contract (`supabase/functions/compute-outer-readiness/index.ts`)

In the `try { ... }` block around line 4046, replace the day-scoped check-in test with a window-scoped DB lookup. Wearable freshness already uses `hasTodayWearableData` (`wearableSourceAgeDays === 0`), which is the correct scope for wearables — no change needed there. The wearable's per-window staleness you described (e.g. wearable dies in afternoon, no evening reading) is naturally captured by `hasTodayWearableData` because evening sync would write a fresh `summary_date = today` row; the absence of that row keeps `hasTodayWearableData = false` so the user gets the prompt. This is exactly the symmetric behavior you want.

Insert immediately before the existing contract block:

```ts
// Window-scoped check-in lookup. Multiple check-ins per day are allowed;
// each is slotted to the window in which it was submitted. The Brief
// reflects "this period of the day," so only a check-in tagged to the
// current period satisfies the contract. A morning check-in does NOT
// satisfy the afternoon brief; an afternoon check-in does NOT satisfy
// the evening brief. Any newer check-in within the same period
// supersedes earlier ones (briefId already keys off input_signature, so
// the snapshot regenerates automatically on the next request).
const currentPeriod = getTimeOfDay(hour); // 'morning' | 'afternoon' | 'evening'
let hasCheckInForCurrentPeriod = false;
try {
  const { data: periodCheckin } = await db
    .from('daily_checkins')
    .select('id')
    .eq('user_id', userId)
    .eq('checkin_date', userLocalDate)
    .eq('time_window', currentPeriod)
    .eq('skipped', false)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  hasCheckInForCurrentPeriod = !!periodCheckin;
} catch (e) {
  console.warn('[compute-outer-readiness] Period check-in lookup failed:', e);
  // Fail safe: if the lookup throws, fall back to the prior day-scoped
  // signal so we never block a legitimate brief on a transient DB error.
  hasCheckInForCurrentPeriod = !!checkInOutcome;
}
```

Then update the contract:

```ts
const hasTodayCheckIn = hasCheckInForCurrentPeriod;             // ← was !!checkInOutcome
const hasFreshWearable = !!wearableContext && hasTodayWearableData === true;
const briefSignalContractMet = hasTodayCheckIn || hasFreshWearable;
const awaitingSignals = !briefSignalContractMet;
const awaitingReason: string | null = awaitingSignals ? 'no-checkin-no-wearable' : null;
```

Why this is sufficient and self-correcting:

- The brief's snapshot cache key already includes `local_date` + `time_window` (line 4096), so when the user submits the evening check-in, `input_signature` flips, the cache misses, the brief regenerates with the new outcome — no extra invalidation needed.
- Multiple check-ins per period are honored: the `.order('timestamp', desc).limit(1)` picks the most recent, and the snapshot's `input_signature` already incorporates the latest signal so any change forces a new brief.
- The Plan side already enforces the same window-scoped contract (`generate-mastery-plan` line 2071), so Brief and Plan move in lockstep after this change. No edit to `generate-mastery-plan`.
- Awaiting reason stays `'no-checkin-no-wearable'` (single internal label; user copy never says "window").
- Wearable users are unaffected when their wearable is connected and writing per-day rows. If the wearable stops writing for the day (battery dead, removed, sync failure), `hasTodayWearableData` flips false; if no period check-in exists either, the brief enters awaiting — exactly the behavior you described.

No other server logic changes. The existing `awaitingSignals ? null : ...` ternaries in the response payload (lines 4171–4189) already nullify phrase/body/leanOn/watchFor and gate LLM persistence at line 4103.

---

### Change 2 — Delete the offending fallback copy (`src/components/home/DailyRitual.tsx`)

Per your direction, "Your plan is being prepared. Pull down to refresh." is removed entirely from the codebase — no replacement copy.

Replace lines 611–619:

```tsx
if (activeModules.length === 0 && !loading) {
  return (
    <div className="px-4 py-5">
      <p className="text-sm text-muted-foreground">
        Your plan is being prepared. Pull down to refresh.
      </p>
    </div>
  );
}
```

with:

```tsx
if (activeModules.length === 0 && !loading) {
  // Empty-state fallback intentionally renders nothing. The unified
  // "awaiting signals" prompt is owned by TodayThreePriorities; if
  // DailyRitual ever mounts in this state (parent edge case), it
  // stays silent rather than echoing a duplicate or stale message.
  return null;
}
```

After Change 1, this branch should also become unreachable on `/plan` because `TodayThreePriorities` will correctly enter `awaitingSignals = true` and render its own prompt without firing `onEmpty` (suppressed by the existing useEffect at lines 686–697). Returning `null` is belt-and-suspenders so the line can never resurface.

---

### Files touched

| File | Change |
|---|---|
| `supabase/functions/compute-outer-readiness/index.ts` | Insert window-scoped check-in lookup; update `hasTodayCheckIn` to use it. ~15 lines added. |
| `src/components/home/DailyRitual.tsx` | Replace lines 611–619 empty-state fallback with `return null;` |

No client/edge function changes beyond these two. No DB migration. No new memory file (the window-scoping rule is already codified in `mem://features/performance-readiness/data-honesty-standards` and `mem://backend/architecture/standardized-time-windows`; I'll add a short note to the data-honesty memory clarifying that "today's check-in" must mean **current-period** check-in, since this is the lesson learned).

---

### What's intentionally NOT done (per your direction)

- ❌ No new `awaitingReason: 'window-rolled-over'` variant. Single reason `'no-checkin-no-wearable'` covers all paths; the user-facing copy you already approved ("Update your performance readiness assessment/check in or connect your wearable…") covers both first-time-of-day and rolled-over-period cases without ever using the word "window".
- ❌ No bypass-through-`checkInOutcome` for content selection. The outcome variable continues to flow through scoring/theme paths as before — only the brief contract gate becomes window-scoped. Nothing about content matching or pillar mode changes.
- ❌ No edits to the Plan edge function — its window scoping is already correct.

---

### Manual QA after deploy

1. Submit afternoon check-in, then advance system time to evening (or wait): Brief enters awaiting, Plan empty, both show "Update your performance readiness assessment or connect your wearable…", `DailyRitual` does not mount.
2. With wearable connected and today's HRV row present: Brief and Plan render normally even with no period check-in.
3. Submit evening check-in: Brief regenerates within ~1s (cache miss on new `input_signature`), Plan regenerates on next mount. Both populate.
4. Verify the string `Pull down to refresh` is gone from the bundle (`rg "Pull down" src/`).

Reply **"go"** to implement, or tell me to tighten anything before I switch to default mode.