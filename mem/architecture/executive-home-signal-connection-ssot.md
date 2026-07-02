---
name: Executive Home Signal & Connection SSOT
description: Canonical memory for Executive Home awaiting-state rules, Apple Health/Calendar connection semantics, reason-aware awaiting copy, and wearable source dedupe.
type: feature
---

## Purpose

Executive Home must explain missing or delayed signals clearly without showing mismatched card states. This memory is the source of truth for the product/architecture decisions around:

- MRS / Brief / Plan awaiting visibility.
- Signal pill colour and missing-data behaviour.
- Apple Health / Apple Calendar connection semantics.
- Reason-aware copy in place of generic awaiting copy.
- Wearable source dedupe when Apple Watch, Apple Health, Oura, or mixed HealthKit sources coexist.

When this conflicts with older docs, treat this memory as the current decision record and verify against live code before editing.

---

## 1. One Shared Executive Home Gate

All three Executive Home cards must follow the same current-window readiness contract.

Canonical awaiting condition:

```text
cardsAwaiting =
  innerReadinessState === 'awaiting'
  OR innerReadinessScore == null
  OR awaitingSignals === true
  OR briefMode === 'cold-start'
```

When `cardsAwaiting` is true:

- MRS shows the awaiting state, no score.
- Brief does not show generated phrase/body/Lean On/Watch For.
- Plan does not hydrate from cache, snapshot, or live generation.
- Signal pills render neutral/unread, never green/amber/red.
- Signal pill details may show required missing rows, but must not show stale coloured evidence.
- Side panel / Recent Briefs must not create or show a delivered Brief unless the Brief was actually visible to the user.

The rule is intentionally stricter than “calendar connected”. Calendar context may exist, but if MRS is awaiting/null, the visible card suite stays awaiting.

---

## 2. Known Drift Paths To Guard

These are the places most likely to break the shared gate.

| Surface | Drift Risk |
|---|---|
| Brief snapshot overlay | A persisted `brief_snapshots` row with phrase/body can override live awaiting state. |
| Signal pills | UI may fall back to local computed pill colour when server `signalPills` is missing. |
| Plan card | Cached/session/snapshot plan can hydrate before checking current MRS awaiting state. |
| Plan edge function | Calendar-connected users can generate plan unless server gate also respects MRS awaiting/null. |
| Recent sidebar | `brief-history?delivered=1` can expose rows that were persisted but not actually visible. |

Fix direction:

- derive a single shared gate and apply it before cache/snapshot hydration;
- when awaiting, clear or ignore stale plan/brief cache for current window;
- force neutral signal pill visuals instead of falling back to local colours;
- persist delivered Brief snapshots only when the Brief was visible.

---

## 3. Day-1 MRS Principle

MRS should not require mature patterns before giving an early read.

Rules:

- One real score-bearing wearable input can create a Day-1 early read.
- Fresh HRV or fresh RHR may count even before personal baselines are mature.
- Missing sleep, HR, RHR trend, and patterns are unavailable, not neutral.
- Missing pattern must not become `50` unless explicitly labelled as non-score-bearing framing.
- If nothing score-bearing exists, MRS remains awaiting.

This preserves the core concept: proactive read based on state and context, without fabricating neutral data.

---

## 4. Reason-Aware Awaiting Copy

The old blanket copy is too vague:

```text
Awaiting signals — sync your wearable and calendar to get an early read and check in to sharpen it.
```

Keep the same visual awaiting state, but choose copy based on the actual reason.

Preferred copy variants:

| State | Copy Direction |
|---|---|
| First-time / never connected | "Connect your wearable and calendar to get an early read, then check in to sharpen it." |
| Apple Health permission revoked | "Apple Health access needs attention — reconnect it to restore your readiness read." |
| Apple Health connected, no new data | "Apple Health is connected, but no new wearable data has arrived yet." |
| Apple Health sync delayed | "Apple Health is connected, but the latest sync is delayed. We'll keep retrying." |
| Apple Calendar permission revoked | "Apple Calendar access needs attention — reconnect it to restore your day context." |
| Apple Calendar sync delayed | "Apple Calendar is connected, but the latest refresh is delayed. We'll keep retrying." |
| Calendar connected, no events | "Calendar connected — no events found for this window." |
| Wearable present, calendar missing | "Wearable signal received — connect calendar for a fuller read." |
| Calendar present, wearable missing | "Calendar signal received — sync wearable for a fuller read." |

Executive Home should prefer inline reason-aware card copy over a separate banner. A banner/card is reserved for Connected Data or persistent account-level problems.

---

## 5. Apple Health / Apple Calendar Connection Semantics

Google and Microsoft calendars are OAuth integrations with server refresh tokens.

Apple Calendar and Apple Health are native iOS permission integrations:

- Apple Calendar authority = EventKit permission + last successful sync.
- Apple Health authority = HealthKit permission + data freshness / last successful sync.
- Bluetooth should not be used as the connection authority.
- Without a companion Watch app, WatchConnectivity is not a reliable product-level connection check.

Do not mark Apple integrations disconnected for transient failures.

| Condition | Correct State |
|---|---|
| Permission granted, no new HealthKit sample | Connected, waiting for data |
| Permission granted, backend write failed | Connected, sync delayed |
| Permission granted, native read temporarily unavailable | Connected, sync delayed |
| Permission explicitly denied/revoked | Reconnect required |
| Apple Calendar fetch/post failed temporarily | Connected, sync delayed |
| Apple Calendar permission denied/revoked | Reconnect required |

Only explicit permission denial/revocation should ask the user to reconnect.

---

## 6. Apple Watch / Bluetooth Decision

Do not attempt to infer Apple Watch connection from Bluetooth.

Reasons:

- iOS does not expose reliable Apple Watch Bluetooth connection state for this use case.
- CoreBluetooth cannot identify Apple Watch as a stable readiness-data source in an App Store-safe way.
- The app's real dependency is not Bluetooth; it is HealthKit data availability and permission.

Correct product model:

```text
Apple Watch contributes through HealthKit.
HealthKit permission + data freshness is the connection signal.
```

---

## 7. Wearable Source Dedupe / Merge Rule

Calendar has cross-provider dedupe. Wearables need a similar canonical merge rule.

Current risk:

- Apple Health and Oura both write into `wearable_data`.
- The table is keyed by `(user_id, summary_date)`, so there is one row per day, not one row per provider.
- Last sync can overwrite row-level `source`, even when individual metrics came from mixed sources.
- Some non-null metric preservation exists, but there is no explicit per-metric source-priority contract.

Target model:

- Resolve canonical wearable context per metric, not only per day.
- Preserve metric-level source attribution (`source_apps`, `source_provider`, or future metric source map).
- MRS / Brief / Plan consume one resolved wearable context, not whichever provider wrote last.

Suggested priority:

| Metric | Preferred Source |
|---|---|
| Sleep duration / sleep score / sleep efficiency | Direct Oura if connected and fresh; else Apple Health / HealthKit |
| HRV | Freshest same-day source with valid value and baseline compatibility |
| RHR | Freshest same-day source with valid value; Oura acceptable for lowest/resting HR |
| Intraday HR / HR samples | Apple Watch / HealthKit preferred |
| Source label | Mixed when different metrics come from different providers |

Missing data should remain missing. Do not fill missing metrics with neutral defaults.

---

## 8. Signal Pill Display Contract

Signal pills belong to Brief, but they must obey the shared card gate.

When cards are awaiting:

- all three pills are neutral;
- labels are unread-style, e.g. Mind Unread / Body Unread / Reserve Unread;
- no green/amber/red icon or badge colour remains;
- missing required rows should be visible where useful:
  - Sleep: no data available / not synced;
  - RHR: value or no data available;
  - HR: value, estimated, or no data available;
  - check-in dimensions: value or no check-in yet.

The tooltip/detail can explain missingness, but the header must not imply a scored state.

---

## 9. Implementation Checklist For Future Fixes

Before changing Executive Home signal logic, verify these paths:

- `src/components/home/DecisionReadinessBrief.tsx`
- `src/components/home/PillTooltip.tsx`
- `src/components/home/TodayThreePriorities.tsx`
- `src/hooks/useOuterReadiness.ts`
- `src/hooks/useCurrentBriefSnapshot.ts`
- `src/hooks/useRecentActivity.ts`
- `src/hooks/useCalendarSync.ts`
- `src/hooks/useWearableSync.ts`
- `src/services/wearableSyncService.ts`
- `src/services/appleCalendarSync.ts`
- `supabase/functions/compute-inner-readiness/index.ts`
- `supabase/functions/compute-outer-readiness/index.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/build-executive-home-cards/index.ts`
- `supabase/functions/brief-history/index.ts`
- `supabase/functions/persist-wearable-data/index.ts`
- `supabase/functions/sync-oura/index.ts`
- `supabase/functions/sync-apple-calendar/index.ts`
- `supabase/functions/check-connections-status/index.ts`

Minimum verification:

- MRS awaiting/null hides generated Brief and Plan.
- Refresh cannot resurrect stale Plan or stale Brief snapshots.
- Signal pill headers and icons are neutral in awaiting.
- Side panel only shows delivered Briefs.
- Apple Health/Calendar transient sync failure does not show disconnected.
- Permission revoked clearly asks for reconnect.
- Oura + Apple Watch same-day data resolves deterministically.

