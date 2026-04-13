

# Fix Wearable Split-Logic Bug — Unified Data Contract

## Root Cause Confirmed

The user's diagnosis is correct. There are **two logic paths** consuming wearable data from the same edge function response:

**Path A (Lean On/insights):** Checks `hasWearable` (line 2351), which is `!!wearableContext`. A wearable row with `{ hrv: null, rhr: null, sleepScore: null, sleepDuration: null, source: 'apple-healthkit' }` makes this **truthy** → Lean On renders "Physiological credit · Wearable".

**Path B (Pills):** Checks individual values — `hrvValue`, `rhrValue`, `sleepDuration`, `sleepScore`. When all are null (row exists but no metrics yet), **zero chips render** → "Wearable syncing" fallback fires.

Result: Lean On says "trust your body" while pills say "syncing" — contradictory states from the same payload.

## Fix: 3 Changes

### 1. Edge function: Add `wearableStatus` object to response

**File:** `supabase/functions/compute-outer-readiness/index.ts`

After line 2377, compute a unified status object and include it in the response (line 3741):

```
wearableStatus: {
  isConnected: !!wearableContext,
  hasTodayData: !!wearableContext && (hrvValue != null || sleepDuration != null || sleepScoreVal != null || rhrValue != null),
  hasRecentData: wearableDaysConnected > 0,
  metricsAvailable: {
    hrv: hrvValue != null,
    sleep: sleepDuration != null || sleepScoreVal != null,
    rhr: rhrValue != null,
  },
  sourceRowDate: null, // populated below
  dataSource: wearableDataSource,
}
```

Also capture the `summary_date` from the wearable query (line 1961) by adding it to the SELECT and storing it.

Fix `hasWearable` itself: change from `!!wearableContext` to `!!wearableContext && (hrvValue != null || sleepDuration != null || sleepScoreVal != null || rhrValue != null)` — so that Lean On only claims "Physiological credit" when there's actually usable data.

### 2. Edge function: Gate "Physiological credit" on actual data

**File:** `supabase/functions/compute-outer-readiness/index.ts` (line 3660)

Change `wearableSteady` check to require at least one non-null metric, not just `hasWearable`:

```
// Before: if (wearableSteady) → push "Physiological credit"
// After:  if (wearableSteady && wearableStatus.hasTodayData)
```

### 3. Client: Use unified status for rendering decisions

**File:** `src/components/home/DecisionReadinessBrief.tsx` (lines 377-382)

Replace current fallback logic:

```typescript
// Current (broken):
if (tier === 'none') → "Connect wearable"
else if (no heart/sleep chips) → "Wearable syncing"

// Fixed:
const ws = outerBrief?.wearableStatus;
if (!ws?.isConnected) {
  // No wearable at all
  chips.push({ id: 'wearable-prompt', label: 'Connect wearable for full intelligence', color: 'neutral' });
} else if (ws?.hasTodayData) {
  // Normal: Heart + Sleep pills already rendered above
  // No fallback needed
} else if (ws?.hasRecentData) {
  // Connected, recent data exists but not today's
  chips.push({ id: 'wearable-recent', label: 'Based on recent data', color: 'neutral', qualifier: `Last sync: ${ws.sourceRowDate}` });
} else {
  // Connected but no data yet at all
  chips.push({ id: 'wearable-syncing', label: 'Waiting for wearable data', color: 'neutral' });
}
```

### 4. Add `remainingMeetings` to response (meeting count fix from prior audit)

**File:** `supabase/functions/compute-outer-readiness/index.ts` (line 3774)

Add `remainingMeetings: calendarResult.remainingMeetings ?? 0` to the response object.

**File:** `src/hooks/useOuterReadiness.ts` — Add `remainingMeetings?: number` to interface.

**File:** `src/components/home/DecisionReadinessBrief.tsx` — Calendar pill uses `remainingMeetings` when > 0, shows "meetings done" when 0.

### 5. Prefix Mind Sharpness labels with "Mind"

**File:** `src/components/home/DecisionReadinessBrief.tsx` (lines 403-414)

Change all labels: `'Focused'` → `'Mind focused'`, `'Steady'` → `'Mind steady'`, etc.

### 6. Watch For prose guard

**File:** `src/components/home/DecisionReadinessBrief.tsx`

Add a client-side guard: if a `watchFor` line has no ` · ` separator and exceeds 40 chars, truncate to first 3 words + ` · System`.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/compute-outer-readiness/index.ts` | Add `wearableStatus` to response; gate Lean On on `hasTodayData`; add `remainingMeetings`; capture `summary_date` |
| `src/components/home/DecisionReadinessBrief.tsx` | Unified wearable rendering logic; "Mind" prefix on sharpness pills; meeting count fix; watchFor prose guard |
| `src/hooks/useOuterReadiness.ts` | Add `wearableStatus` and `remainingMeetings` to interface |
| `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` | Document unified wearable contract |

## Implementation Order

1. Edge function: add `wearableStatus` + gate Lean On + add `remainingMeetings`
2. Client types: add new fields to interface
3. Client UI: unified rendering logic + Mind prefix + meeting fix + prose guard
4. Docs update
5. Deploy + verify

