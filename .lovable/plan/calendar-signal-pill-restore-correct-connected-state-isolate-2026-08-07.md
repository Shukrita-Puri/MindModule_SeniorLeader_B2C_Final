# Calendar Signal Pill — Restore Correct Connected State (Isolated Fix)

## What is wrong

Two separate issues, both frontend-only.

**1. Calendar pill says "CONNECT" although the calendar is connected.**
Confirmed from the database: this account has 132 calendar events, 22 in the last 7 days, 4 today, last sync yesterday evening. The calendar is genuinely connected.

The pill is wrong because of where the Brief card now gets its data. Home renders from saved brief snapshots and no longer calls the live readiness pipeline. The saved snapshot rows contain no calendar fields at all (verified: `hasCalendar`, `calendarState`, `meetingCount` are absent from every recent snapshot row). With those fields missing, the pill logic reads "unknown" and falls through to the "CONNECT" prompt. Nothing about the calendar itself changed — the pill simply lost its data source when Home moved to snapshot-only rendering.

**2. Category letters are showing on the NEXT UP pill.**
The internal A–H event category was added to the pill label. That was not wanted: categories are internal, for the Brief copy only.

## The fix

**Restore the pill's data source.** Add a small read that fetches the same canonical calendar numbers the Brief used to carry — connection state, load, meeting counts, high-stakes titles — using the existing read-only context mode of the readiness function. No new calendar rules, thresholds, or classification are written on the client; it is the same server answer, just fetched directly now that the Brief payload no longer carries it.

The pill uses this only when the Brief payload has no calendar fields. When the payload does carry them (manual refresh, non-snapshot surfaces), behaviour is untouched.

**Remove the category from the pill label.** NEXT UP returns to showing only the event title and time, exactly as before. Categories stay in the Brief prompt and in Plan logic, invisible to the user.

## Scope

- No backend, edge function, or database changes.
- No changes to the Mind / Body / Reserve pills, MRS, Brief copy, or Plan.
- Calendar pill states (CONNECT / LIGHT / MODERATE / HEAVY / NEXT UP) stay exactly as originally designed.

## Technical detail

- New `src/hooks/useCalendarPillContext.ts`: React Query hook invoking `compute-outer-readiness` with `contextOnly: true`, returning `calendarState`, `calendarLoad`, `meetingCount`, `remainingMeetings`, `remainingHighStakes`. 10-minute stale time, no focus refetch, enabled only when the Brief payload lacks `calendarState`.
- `src/components/home/DecisionReadinessBrief.tsx` → `CalendarPills`: merge the fallback into the existing `hasCalendar` / `calendarState` / `calendarLoad` / meeting-count reads; keep the current branch structure verbatim. While the fallback is still loading and the payload has no calendar fields, render nothing rather than a wrong "CONNECT".
- Same file: drop the `category` suffix from the three NEXT UP pill `qualifier` values (lines ~1803–1841), reverting them to `timeLabel` / `'ahead'`.
- Verify with `tsgo` and the existing frontend test suite.