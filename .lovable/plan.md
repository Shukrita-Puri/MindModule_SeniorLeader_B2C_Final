

## Root Cause Analysis and Fix Plan

### Three Issues Found

**Issue 1: "Connected · Waiting for HRV data" shown incorrectly**

The `check-connections-status` edge function only marks Apple Watch as connected if a `wearable_data` row exists from the last 7 days. On web preview (non-native), the local permission flag forces `connected: true` but `lastSync` stays null and `hasData` stays false, triggering the "Waiting for HRV data" message at line 424-429 of `ConnectedData.tsx`.

The real problem is that on non-native platforms, the status merging logic always shows the waiting state. The fix: when the backend returns `lastSync` data (meaning DB rows exist), that should be respected even when the local permission flag is the connection source.

**Issue 2: Wearable HRV data is NOT being used in Inner Readiness scoring (critical bug)**

`src/utils/energyStateEngine.ts` line 170 reads:
```
localStorage.getItem('wearableData')
```

But `wearableSyncService.ts` saves to `local_wearable_data` (via `localDataStore.ts`). These keys don't match. The engine always reads `{}`, so `hasWearable` is always `false`, and the wearable signal is never passed to `compute-inner-readiness`.

Additionally, the engine expects `{ hrv, readiness, baseline }` shape but `localDataStore` saves `{ entries: [...] }` — the data shape is also incompatible.

**Fix**: Update `energyStateEngine.ts` to read from the correct localStorage key AND parse the entries array to extract the latest HRV. Also attempt to fetch from the DB (like `useWearableSync` does) as a more reliable source. Include the user's HRV baseline from the DB.

**Issue 3: "Based on" label missing wearable**

`TodayStateCard.tsx` already correctly maps `dataSources` — when `'wearable'` is in the array it shows "wearable score". This is working code; it just never fires because Issue 2 means the wearable signal is never included. Fixing Issue 2 automatically fixes this.

### Changes

| File | Change |
|------|--------|
| `src/utils/energyStateEngine.ts` | Fix wearable data retrieval: read from correct localStorage key (`local_wearable_data`), parse entries array for latest HRV, and also query `wearable_data` DB table for HRV + baseline when userId is available |
| `src/pages/ConnectedData.tsx` | Fix statusNote logic: when backend returns `lastSync`, don't show "Waiting for HRV data". Only show waiting state when genuinely no data exists anywhere |
| `src/assets/shared/apple-health-icon.png` | Replace with the uploaded cropped icon (logo only, larger heart) |

### Technical Detail

For the wearable data fix in `energyStateEngine.ts`, the new flow will be:
1. Try DB first: query `wearable_data` for latest HRV + compute 7-day baseline (reuse `getUserHRVBaseline` from `wearableContextAnalyzer.ts`)
2. Fall back to `local_wearable_data` localStorage key, parse entries array, pick latest
3. Pass `wearableHRV` and `wearableBaseline` to `compute-inner-readiness`
4. The edge function already handles wearable weighting correctly (25-35% weight depending on divergence) — no backend changes needed

