

## Root Cause Analysis: "No HRV Data Available Yet"

### The Problem

The `wearable_data` table is **completely empty** and `persist-wearable-data` has **zero logs** — meaning the edge function has never been called. The data pipeline is breaking before it reaches the backend.

### Root Cause Chain

1. **On simulator** (your screenshot says "Simulator Screenshot - iPhone 17 Pro"): `Capacitor.isNativePlatform()` returns `true`, so the HealthKit code runs. However, **iOS Simulator has no paired Apple Watch and no HRV data in HealthKit** unless you manually add samples via the Health app. The `readSamples` call returns 0 samples → `hrv === null` → sync service returns `{ hasData: false }` → "No HRV data available yet".

2. **On a real device**: The same flow *should* work if the Apple Watch is paired and has HRV readings. But two issues could prevent it:
   - The `@capgo/capacitor-health` plugin's `readSamples` may return data in a different shape than expected (the code tries `hrvRes?.samples ?? hrvRes?.data ?? []` but the actual plugin may use a different key)
   - The `dataType: 'heartRateVariability'` string may not match the plugin's expected identifier (some Capacitor Health plugins use `'heart_rate.variability.sdnn'` or the full HK identifier)

3. **No diagnostic logging**: When `readSamples` returns empty, there's no log of the raw response shape, making it impossible to tell if it's "no data exists" vs "data exists but parsing failed".

### Fix Plan

| File | Change |
|------|--------|
| `src/utils/healthKitCapacitor.ts` | Add raw response logging to diagnose exact plugin response shape. Log the full `hrvRes` object before parsing. Add a fallback check for alternative response keys (`results`, `resultData`). |
| `src/services/wearableSyncService.ts` | Add logging around the persist call: log when skipping (no data), when calling persist, and the response status. |
| `src/pages/ConnectedData.tsx` | Update the status note for the "connected but no data" state to distinguish simulator vs real device, and show "Open Health app to verify HRV data exists" hint. |

### Key Diagnostic Addition

In `queryHealthKitData()`, before parsing:
```typescript
console.log('[HealthKit] Raw readSamples response keys:', Object.keys(hrvRes));
console.log('[HealthKit] Raw readSamples response:', JSON.stringify(hrvRes).slice(0, 500));
```

This will immediately reveal whether the plugin is returning data in an unexpected shape.

### Simulator Workaround

For testing on simulator, users can manually add HRV data:
1. Open the Health app on simulator
2. Browse → Heart → Heart Rate Variability
3. Add Data manually

### Summary

The most likely root cause is that **no actual HRV samples exist in HealthKit on the simulator**. On a real device with Apple Watch, the pipeline should work but needs better diagnostic logging to confirm the plugin response shape. The fix adds logging at every stage so the exact failure point is visible in device console logs.

