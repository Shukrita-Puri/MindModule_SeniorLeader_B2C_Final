

## Wearable continuity fix — stop "ghost disconnects" and keep data flowing without manual syncing

### What's actually happening (root cause)

I checked your DB. Your data **isn't being removed**. Three real problems are creating that perception:

1. **Sync only runs when the app is open.** Today, HealthKit is read in JS via `useWearableSync` on app launch + foreground resume + a 30-min interval. iOS suspends JS the moment the app is backgrounded — so if you wear the watch but don't open the app for a day, **nothing syncs**, and yesterday's row simply doesn't exist yet in the DB. When you next open the app, it appears as if "yesterday is missing."
2. **Sleep is never being captured.** Every row in `wearable_data` for your account has `total_sleep_minutes = null` and `sleep_score = null`. The `@capgo/capacitor-health` plugin returns sleep samples in a shape your aggregator is partially dropping (the `sleepState` field handling and the in-bed/awake split). This makes the Physiology pillar look broken even when you wore the watch overnight.
3. **The "Connected" status flips to stale-looking too easily.** `useWearableSync` exposes `isStale=true` whenever the app reloads before HealthKit is live-verified, which the UI sometimes reads as "needs reconnect." Underneath, **the connection is still valid in HealthKit** — iOS does not silently revoke permission. The user just sees a "reconnect"-flavoured prompt and re-grants, which feels like the device was disconnected.

Your last DB row for HRV is `2026-04-15`; last status update `2026-04-18 20:45`. That's not "removal" — that's a 3-day gap where the app wasn't opened to pull HealthKit while you happened to be wearing the watch. iOS *kept* recording the data into Apple Health; **we just never asked for it.**

### The fix — three layers

#### Layer 1 — True iOS background sync (silent, no app open required)

`@capgo/capacitor-health` has no background-delivery API. We add a small native Swift module in `AppDelegate.swift` that uses `HKObserverQuery` + `HKHealthStore.enableBackgroundDelivery(...)`. iOS will then wake the app silently every time HealthKit gets new HRV / RHR / HR / Sleep samples (no UI, no notification — Apple's recommended pattern), pull a 7-day window via `HKAnchoredObjectQuery`, and POST it to the existing `persist-wearable-data` edge function using the Auth0 token cached in iOS Keychain.

Frequency: iOS coalesces these wake-ups to ~hourly when on Wi-Fi/charging, immediately when the watch syncs to the phone. No user action required.

```text
[Apple Watch] → [Health app] → [HKObserverQuery wakes our app silently]
              → [HKAnchoredObjectQuery reads new samples since last anchor]
              → [POST persist-wearable-data]  ✅ DB stays current
```

Files touched: `ios/App/App/AppDelegate.swift`, `ios/App/App/Info.plist` (add `processing` and `fetch` to `UIBackgroundModes`), `ios/App/App/App.entitlements` (HealthKit background delivery is already implicit in the HealthKit entitlement).

Anchor + auth-token persistence: stored in iOS Keychain via a tiny `WearableSyncBridge.swift` so the JS layer and native layer share the same anchor cursor.

#### Layer 2 — Fix sleep ingestion (the silent failure you've been hitting)

In `src/utils/healthKitCapacitor.ts` the sleep aggregator:
- correctly handles `'deep'`, `'rem'`, `'light'`, `'asleep'`, `'inBed'`
- but the **`@capgo/capacitor-health` v8 sleep payload uses `sleepState`** as the discriminator AND emits separate samples per state — your aggregator sums durations correctly per state but then **excludes `'asleep'` (the iOS umbrella state) when both `'asleep'` and per-stage rows exist** — leading to `totalSleepMinutes = 0` → filtered out → `null` in DB.

Fix: switch to `queryAggregated({ dataType: 'sleep', bucket: 'day', aggregation: 'sum' })` (now exposed by capgo plugin) for total minutes, and keep the per-stage `readSamples` only to compute deep/REM splits. Cap `totalSleepMinutes` at the sum of all non-`awake`/non-`inBed` states. Sleep score recomputed from the corrected total + in-bed.

#### Layer 3 — Stop the "reconnect" UX from firing when nothing is wrong

In `src/hooks/useWearableSync.ts` and `src/pages/ConnectedData.tsx`:

- **`isStale` no longer surfaces a reconnect CTA.** It just triggers a quiet re-verify in the background. The user only sees a reconnect button when `verifyHealthKitAccess()` returns `false` AND `getHealthKitAuthorization()` confirms denial — never on "we just haven't verified yet this session."
- **"Last sample" copy reflects the truth.** When status = `connected` but the last sample is, say, 2 days old, the card reads `"Connected · No data captured Apr 16–17 (watch not worn)"` instead of `"Sync delayed"`. We compute the gap from `wearable_data` rows already in the DB — no HealthKit round-trip needed.
- **Disconnect button does NOT delete historical rows** (already true) — confirmed in `persist-wearable-data` `disconnect` action. Adding a one-line note in the disconnect confirmation: *"Your historical data is preserved. Reconnecting will resume syncing — you won't lose anything."*

### Database / backend

`persist-wearable-data` already does the right thing (upsert on `user_id,summary_date`, partial-metric tolerance, status preserved on disconnect). The native module will hit the same endpoint with the same payload shape, so **no edge-function changes** beyond:

- Add an optional `source: 'ios-background'` discriminator on the bulk path so we can log background syncs separately in `user_integrations.watch_sync_status`.
- Persist `last_anchor` (opaque string) in a new column on `user_integrations` so the native module can resume incremental reads.

Migration: 1 column added — `user_integrations.healthkit_anchor TEXT NULL`.

### What this changes for you (as a user)

- **Wear the watch → data appears next time the app opens, automatically.** No manual sync.
- **Stop wearing it for a few days → no "device disconnected" prompt. Just a quiet "no data captured" line for those days.** Pick the watch back up → next sync resumes — no reconnect, no permission re-grant.
- **Sleep data starts populating** (it currently doesn't).
- **Decision Readiness pillars stop flipping to grey/UNKNOWN** when the watch is in a charger overnight.

### Files touched

| File | Change |
|---|---|
| `ios/App/App/AppDelegate.swift` | Wire up `HKObserverQuery` + `HKAnchoredObjectQuery` + `enableBackgroundDelivery` for HRV/RHR/HR/Sleep on `didFinishLaunchingWithOptions` |
| `ios/App/App/WearableSyncBridge.swift` | NEW — Swift module: token from Keychain, anchored query, POST to edge function, anchor persistence |
| `ios/App/App/Info.plist` | Add `processing` + `fetch` to `UIBackgroundModes` |
| `src/utils/healthKitCapacitor.ts` | Switch sleep aggregation to `queryAggregated` + corrected per-stage logic |
| `src/hooks/useWearableSync.ts` | Quieter `isStale` semantics; only flip to `permission_revoked` when authorization explicitly denied |
| `src/pages/ConnectedData.tsx` | New "no data captured" copy when connected but last_sample > 24h; clearer disconnect confirmation |
| `supabase/functions/persist-wearable-data/index.ts` | Accept + persist `healthkit_anchor`; log `source: 'ios-background'` separately |
| `supabase/migrations/<ts>_healthkit_anchor.sql` | `ALTER TABLE user_integrations ADD COLUMN healthkit_anchor TEXT;` |

### Verification

1. Background-sync probe: kill the app, wait 60 min, check `wearable_data.updated_at` advanced without opening the app. Console-side, verify `user_integrations.watch_sync_status` reads `synced` with a recent `watch_last_sync_at`.
2. Sleep probe: wear watch overnight → next morning, `total_sleep_minutes` and `sleep_score` non-null in DB.
3. Off-day probe: don't wear watch for 2 days → ConnectedData card shows `"Connected · No data captured Apr 19–20"`, NOT `"Sync delayed"` or `"Reconnect"`.
4. Permission integrity: confirm reconnect button never appears unless `getHealthKitAuthorization().permissionGranted === false`.
5. Re-wear probe: skip 3 days → put watch back on → no manual sync needed → next background wake-up populates the missing days back to anchor (capped at 7 days).

### Out of scope

- Android Health Connect background delivery (separate work — current app is iOS-first)
- Oura background sync (already cron-driven server-side)
- Changing the v6.2 pillar/veto logic — the data quality fix alone resolves the displayed pillar weirdness
- Deleting historical rows or backfilling > 7 days of missed data (HealthKit anchor model only walks forward)

