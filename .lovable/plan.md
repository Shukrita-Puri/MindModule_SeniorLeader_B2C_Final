# 15-Minute Freshness + Visible Compute on Open

Goal: bring the Apple Watch and Oura paths onto a 15-minute cadence, and guarantee that a user opening the app sees the three Executive Home cards populated within 60 seconds (90 seconds worst case) — with the engraved loader visible on any card that is still computing. Calendars stay exactly as they are.

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

## 4. Cards populated within 60-90s of opening, with a visible loader

Two parts.

**a. Trigger compute on open when the snapshot is not current.**
On app foreground / Home mount, check the persisted Executive Home snapshot for today's local date and current window. If it is missing or belongs to an earlier date/window, fire the existing `build-executive-home-cards` invocation (the same path `useExecutiveHomeCardsRefresh` already uses, reusing its 30s cooldown so we never stampede). If the snapshot is current, render it immediately and do nothing — no change to the cached-render-and-silent-verification rule.

**b. Engraved loader while that compute is in flight.**
While the on-open rebuild is pending, each of the three cards — MRS, Executive Brief, Mastery Plan — shows `EngravedLoader` in place of its body when it has no snapshot content to show yet. If a card already has cached content, it keeps that content and shows the existing subtle "Updating" pulse instead of blanking. Audit each card's current state handling so the loader replaces empty/blank states rather than adding a second spinner:
- `src/components/home/mrs/MrsPage.tsx` (and the MRS home card) — already imports `EngravedLoader`; extend it to the on-open rebuild state.
- `src/components/home/DecisionReadinessBrief.tsx` — has the "Updating" pulse; add the loader for the no-cached-content case.
- `src/components/home/TodayThreePriorities.tsx` — already imports `EngravedLoader`; extend to the rebuild state.

**Timeout behaviour.** Cap the loader at 90 seconds. If compute has not returned by then, fall back to each card's existing awaiting/empty state — never to a spinner that runs forever, and never to any of the forbidden loading strings.

## 4. Verification

- Run `tsgo`.
- Re-query `cron.job` after the migration and confirm Oura is `*/15` and the calendar jobs are unchanged.
- Manually verify a cold open with a stale snapshot: loader appears on the affected cards, content lands, loader clears.
- Report the exact lines changed.

## Out of scope

No calendar cadence changes. No change to MRS scoring, Brief, Plan, nudges (`smart-nudges-every-15m` stays), or the executive-home card job. No new functions, no payload changes.