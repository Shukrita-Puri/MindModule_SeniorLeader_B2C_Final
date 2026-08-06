# 15-Minute Freshness: iOS Background Refresh + Oura

Two scheduling changes only. The Executive Home cards are left completely alone — see section 4 for why.

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

## 4. Executive Home cards — no change

Verified in the current code: `EngravedLoader` is already rendered while data is being read on all three cards.

- `src/components/home/mrs/MrsPage.tsx:145` — loader instead of an empty gauge that would later jump to a value.
- `src/components/home/DecisionReadinessBrief.tsx:2486` — loader on first load; the "Updating" pulse covers silent refresh.
- `src/components/home/TodayThreePriorities.tsx:2004` — loader driven by the card's `loading` state; silent refresh explicitly cannot re-trigger it.

Cached content renders on mount and the loader clears when data resolves. This behaviour is working, so nothing here is touched.

## 5. Verification

- Run `tsgo`.
- Re-query `cron.job` after the migration and confirm Oura is `*/15` and the calendar jobs are unchanged.
- Report the exact lines changed (expected: one Swift line plus one migration).

## Out of scope

No calendar cadence changes. No card, loader, or frontend changes. No change to MRS scoring, Brief, Plan, nudges (`smart-nudges-every-15m` stays), or the executive-home card job. No new functions, no payload changes.