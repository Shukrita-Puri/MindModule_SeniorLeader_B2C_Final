# Week-Ahead notification: make it survive, say what it is, and open the Plan

## What actually happened today (verified in the live send log)

Shukrita received **two** evening notifications on Sunday 6 September:

| Local time | Type | Copy | Opens |
|---|---|---|---|
| 16:00 | Week-Ahead invite | "Sunday reset" / "10 priority choices can shape the week before Monday starts..." | Plan page, week-ahead view |
| 19:00 | Evening close | "Light Monday ahead - 0 meetings on the calendar..." | Daily check-in |

So the week-ahead notification **was** sent with the right copy and the right link. Two problems buried it:

1. **Both notifications carried the same iPhone "collapse" identifier** (`smart-nudge-evening-2026-09-06`). On iOS that means the second one *replaces* the first on the lock screen. By the time she looked, only the "Light Monday ahead" message existed — the week-ahead one was gone.
2. **The evening slot was double-spent.** The rule says one evening send per day, but the check that counts evening sends does not recognise the week-ahead invite as an evening send, so the 19:00 close-out went out on top of it.

Also, the copy title ("Sunday reset") never says *week ahead priorities*, which is why it doesn't read as the week-ahead prompt even when it does survive.

## Changes

### 1. Stop the week-ahead notification being overwritten (iOS)
Give the week-ahead invite its own collapse identifier (`smart-nudge-week-ahead-<date>`) so no later evening notification can replace it on the lock screen. Repeat sends of the same invite still collapse onto each other, as intended.

### 2. One evening notification per day, week-ahead included
Teach the evening-slot counter to treat a `week_ahead_picker_invite` as an evening send. Once the invite goes out, the later evening close-out is skipped for that day, with a clear suppression reason recorded.

### 3. Copy names the week ahead
Rewrite the invite titles so the intent is unmistakable, keeping the existing body lines and the one-per-reason rules:
- weekly planning (Sunday-start countries): **"Week ahead priorities"**
- weekly planning (Saturday-start countries): **"Week ahead priorities"**
- last day of time off: **"Week ahead priorities"** (body unchanged — re-entry framing)
- after a public holiday / long weekend: **"Week ahead priorities"**

The lock-screen subtitle is derived from this title, so it will now read "Week ahead priorities" on the phone.

### 4. Tap always lands on the Plan page
The link already points at `/plan?mode=week-ahead` and the Plan page honours it. Add `week_ahead_picker_invite -> /plan?mode=week-ahead` to the fallback route table in the app's notification tap handler, so an old or stripped payload still opens the Plan page rather than the home screen. This is the iOS tap path.

## Technical notes

- `supabase/functions/smart-nudges/index.ts`
  - week-ahead dispatch block (~6411–6430): replace `collapseId: periodCollapseId("evening", todayStr)` with a dedicated week-ahead collapse id.
  - `slotFromNotificationLogRow` (~665): return `"evening"` for `week_ahead_picker_invite`.
  - `evaluateWeekAheadPickerInvite` variant table (~5134–5164): new titles.
- `src/hooks/usePushNotificationHandler.ts`: add the `week_ahead_picker_invite` entry to `ACTION_ROUTES`.
- Tests: extend `supabase/functions/smart-nudges/suppression_dry_run_test.ts` (or the nearest slot test) with a case asserting that a delivered week-ahead invite blocks the same-day evening close, plus a collapse-id assertion. Frontend test for the new route mapping.
- Deploy `smart-nudges`; no database or schema change.

## Not changing
Firing window (16:00–19:00 local), per-reason dedupe, daily cap, week-ahead eligibility logic, Plan page UI.
