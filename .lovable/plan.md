# 15-Minute Freshness + Immediate Card Population

Goal: bring the Apple Watch and Oura paths onto a 15-minute cadence, and make the three Executive Home cards populate immediately on open — cached content renders instantly, and any card genuinely without content shows the engraved loader until its data lands. No fixed time targets. Calendars stay exactly as they are.

## 1. iOS background refresh: 30 -> 15 minutes

File: `ios/App/App/AppDelegate.swift`, line 83 (single line).

```text
- request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60) // 30 minutes
+ request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
```

This is the earliest iOS will consider the task; iOS still decides the real cadence. No other Swift changes. Takes effect in a device build after `git pull` + `npx cap sync`.

## 2. Oura: hourly -> every 15 minutes

Verified in the live database: the `oura-sync-hourly` job runs `7 * * * *`, once an hour — slower than 15 minutes, so it changes.

Migration: unschedule `oura-sync-hourly` and re-create the same `oura-sync-fanout` call as `oura-sync-every-15m` on `*/15 * * * *`. Command body, headers, and target function stay identical; only name and cadence change.

Note: Oura's cloud publishes daily summaries slowly, so this raises the freshness ceiling rather than guaranteeing new data each cycle. The fan-out is idempotent, so no-change cycles are cheap.

## 3. Calendars: every 30 -> every 15 minutes

No change. `sync-calendar-scheduled` stays on `*/30 * * * *` for Google and Microsoft, and `refresh-calendar-tokens` stays at every 10 minutes. Apple Calendar keeps its existing native triggers (app activation, background refresh, network reconnect) — no scheduling change is made for it.

## 4. Cards populate immediately on open

Three parts, all event-driven — no timers, no target durations.

**a. Paint cached content first, always.**
Every card renders whatever persisted snapshot it already has the instant Home mounts. Cached render stays the default path (cached-render-and-silent-verification); nothing blanks while verification runs.

**b. Fire the rebuild the moment we know it is needed.**
On Home mount and on app foreground, compare the persisted snapshot's local date and window against now. If it is missing or belongs to an earlier date/window, immediately invoke `build-executive-home-cards` through the existing `useExecutiveHomeCardsRefresh` path (keeping its 30s cooldown so repeated foregrounds don't stampede). No debounce or delay in front of it. When the call returns, the existing query invalidation swaps content in as soon as it exists — per card, not as one batch.

**c. Engraved loader only where there is nothing to show.**
A card that has no content and is waiting on that rebuild renders `EngravedLoader` in its body. A card that already has cached content keeps it and shows the existing subtle "Updating" pulse. The loader is bound to the pending state of the rebuild, not to a duration — it clears the instant that card's data resolves. If the rebuild fails or returns nothing, the card falls back to its existing awaiting/empty copy; never a permanent spinner and never any forbidden loading string.

Cards to wire:
- `src/components/home/mrs/MrsPage.tsx` and the MRS home card — already imports `EngravedLoader`; extend to the on-open rebuild state.
- `src/components/home/DecisionReadinessBrief.tsx` — has the "Updating" pulse; add the loader for the no-cached-content case.
- `src/components/home/TodayThreePriorities.tsx` — already imports `EngravedLoader`; extend to the rebuild state.

## 5. Verification

- Run `tsgo`.
- Re-query `cron.job` after the migration and confirm Oura is `*/15` and the calendar jobs are unchanged.
- Manually verify three opens: (1) current snapshot — content is on screen at mount, no loader; (2) stale/missing snapshot — rebuild fires at once, loader shows only on empty cards, each clears as its data lands; (3) rebuild failure — cards land on their awaiting state, no stuck loader.
- Report the exact lines changed.

## Out of scope

No calendar cadence changes. No change to MRS scoring, Brief, Plan, nudges (`smart-nudges-every-15m` stays), or the executive-home card job. No new functions, no payload changes.