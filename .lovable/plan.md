# 15-Minute Freshness: iOS Background Refresh, Oura, and Calendars

Goal: make every automatic data path refresh at least every 15 minutes so a user opening the app sees current Apple Watch, Oura, and calendar data within 60-90 seconds.

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

Verified: `sync-calendar-scheduled` runs `*/30 * * * *` and covers the OAuth-backed providers `google` and `microsoft`. `refresh-calendar-tokens` already runs every 10 minutes and stays as-is.

Migration: re-schedule `sync-calendar-scheduled` to `*/15 * * * *` with the same command body.

Apple Calendar has no server-side path — EventKit data lives only on the device. It already syncs natively on app activation, on every background refresh (now 15 min), and on network reconnect. Change 1 is what tightens Apple Calendar; nothing else is available server-side.

## 4. Verification

- Run `tsgo` (no TypeScript is touched, so this is a regression check only).
- Re-query `cron.job` after the migration and report the resulting schedules.
- Report the exact lines changed.

## Out of scope

No change to MRS scoring, Brief, Plan, nudges (`smart-nudges-every-15m` stays), or the executive-home card job. No new functions, no payload changes.