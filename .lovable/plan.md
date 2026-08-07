# Resilience HR Fallback — Audit Result

## Verdict: the HR fallback is working. Neither Claude hypothesis needs a code fix.

I checked the live data and the persisted pill payload for this account, not just the source.

The most recent evening snapshot (07 Aug, 20:49 UTC) for Resilience Capacity contains:

```text
tier:          green  ("Reserve Strong")
fallbackUsed:  hr_elevated_proxy
contributors:  hrValue = 82, sleepEfficiency = null
freshness:     fresh
sourceTypes:   ["wearable"]
```

So the deployed function is running the new `derive-pills.ts`, the fallback fired, and HR is in the payload. The tooltip whitelist already allows `hrValue` on `resilience_capacity`, so it renders as an "HR — 82 bpm" row.

## Why it looked broken

The snapshot generated earlier the same day (17:00 UTC) shows:

```text
tier: neutral ("Reserve Unread")
hiddenReason: no_fresh_wearable
fallbackUsed: null
```

The Apple HealthKit rows for 07 Aug were only written at 19:51 UTC. Before that there was no same-day wearable row, so `wearableFreshForGate` was false and the fallback correctly did not run. That is Claude's hypothesis 2 — but it was a timing condition, not a defect, and it has already resolved. Hypothesis 1 (stale deploy) is wrong: the deployed bundle clearly contains the fallback.

If "Reserve Unread" is still on screen, it is the client-side cached payload from the 17:00 snapshot. A refresh or app reopen pulls the 20:49 snapshot.

## Proposed change: none to logic

No edits to `derive-pills.ts`, `compute-outer-readiness`, the tooltip, or any other surface. The requested behaviour is already live and verified against real data.

## One observation, not proposed for change now

`wearableFreshForGate` requires a same-day wearable row for afternoon/evening windows. Because HealthKit for this user syncs late (19:51 UTC), Resilience reads "Unread" for most of the day and only turns on in the evening. Loosening that gate would touch MRS, the brief and the other pills, so it is out of scope here. Flagging it so you can decide separately whether late-syncing wearables deserve a wider acceptance window.

## Verification on device

1. Force a manual refresh on the home screen.
2. Open the Resilience Capacity tooltip — expect "HR 82 bpm" and "Reserve Strong".