

## Fix Apple Health HRV Integration and UI

### Summary

The integration pipeline is mostly correct. The core issues are:

1. **Icon**: Still using an Apple Watch black square instead of the Apple Health heart icon
2. **UI labeling**: Says "Apple Watch" instead of "Apple Health"
3. **Status states**: Only shows "Connected - Waiting for HRV data" or last sync time; missing intermediate states like "Syncing..." (already partially there), "No HRV data found", or "Permission denied"
4. **Query window**: 7-day window in `healthKitCapacitor.ts` is reasonable but could be expanded to 30 days for initial query to match the user's request
5. **Backend connection detection**: `check-connections-status` only checks for `wearable_data` rows created in the last 7 days -- if permission is granted but no data exists, backend returns `connected: false`; the frontend merges with localStorage but the status note logic could be richer

### What is already working correctly

- `NSHealthShareUsageDescription` is in Info.plist
- `requestAuthorization` uses `heartRateVariability` (correct)
- `readSamples` is used (not `queryAggregated`)
- Permission granted vs data availability is distinguished in `WearableSyncResult`
- Sync pipeline to `persist-wearable-data` edge function works
- `useWearableSync` hook has staleness checking and auto-sync
- `ConnectedData.tsx` has auto-sync on stale data and manual sync

### Changes

#### 1. Replace Apple Watch icon with Apple Health icon

- Copy the uploaded Apple Health icon (`download_3.png`) to `src/assets/shared/apple-health-icon.png`
- Update import in `ConnectedData.tsx` from `apple-watch-logo.jpg` to `apple-health-icon.png`

#### 2. Rename "Apple Watch" to "Apple Health" in UI

In `ConnectedData.tsx`, update the connection entry:
- `name: 'Apple Health'`
- `description: 'Connect Apple Health for HRV data'`

#### 3. Improve status states in ConnectedData

Replace the simple `statusNote` logic with richer state handling:

```text
syncing        → "Syncing…" (already handled via separate syncing indicator)
connected+data → "Last synced Mar 13, 6:52 PM" (already works)
connected+noData → "Connected · No HRV data available yet"
permission denied → handled by toast on connect failure
```

Update `statusNote` derivation to also show when connected with data but no lastSync timestamp, and add a help hint when no HRV data is found.

#### 4. Expand HRV query window to 30 days

In `src/utils/healthKitCapacitor.ts`, change the `readSamples` date range from 7 days to 30 days. This reduces false "no data" results when the user has HRV readings but not from the recent week.

#### 5. Persist wearable data for all available samples (not just today)

Currently `syncHealthKitToBackend` only sends `summary_date: today`. If the latest HRV sample is from 3 days ago, the data still gets tagged as today's. Fix: use the actual sample date from the HRV reading.

In `src/utils/healthKitCapacitor.ts`, also return the timestamp of the latest sample so `wearableSyncService` can use the correct `summary_date`.

#### 6. Update `HealthKitWearableData` interface

Add `latestSampleDate: string | null` to the return type so the sync service can persist with the correct date.

### Files to change

| File | Change |
|------|--------|
| `src/assets/shared/apple-health-icon.png` | Copy uploaded icon |
| `src/pages/ConnectedData.tsx` | Swap icon, rename to "Apple Health", improve status states |
| `src/utils/healthKitCapacitor.ts` | Expand window to 30 days, return sample date |
| `src/services/wearableSyncService.ts` | Use actual sample date for `summary_date` |

### Not changing

- Database schema (existing `wearable_data` table works fine)
- Edge functions (persist-wearable-data and check-connections-status work correctly)
- Permission flow (already correct)
- `useWearableSync` hook (already handles staleness)
- Background sync (Capacitor/web limitation; the existing auto-sync-on-open pattern is the right approach)

