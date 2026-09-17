# Make Google and Outlook calendars sync on their own

## What I found

Everything needed to sync Google and Outlook calendars in the background already exists in the app: the connect flow, the sync job, the token refresh job, the change-watch registration, and a "Last sync" line in settings.

The background jobs are not running. The scheduled tasks that should refresh tokens and pull meetings every 10–30 minutes are being turned away by the app's own security check, every single time:

- The task fires on schedule and gets back `403 forbidden`.
- The sync task has produced no activity log at all.
- Result: the newest Google meeting stored is from 3 September, no Outlook meeting has ever been stored, and every stored Google/Outlook access token expired weeks ago.

Only Apple Calendar is current (it syncs from the phone), which is why iPhone users look fine and everyone else has no meetings behind their reminders.

## Changes

### 1. Let the scheduled jobs through (the actual fix)

Five scheduled tasks are missing the credential the functions require, so they are all rejected: token refresh, calendar sync, calendar change-watch, plus the plan-card and Oura/session housekeeping ones that share the same check. Recreate those schedules so they send the shared secret the functions expect, matching the schedules that already work today (travel sync, early-morning sync, recovery push).

No function code changes here — the check stays as strict as it is now.

### 2. Recover the connections that went stale while sync was down

Once the jobs run again, some connections will need the person to reconnect (their refresh token was invalidated after weeks of failure). For those:
- Mark the connection as needing reconnect rather than silently failing.
- Surface it through the existing "Reconnect" state in settings and the existing connection-recovery prompt — no new mechanism.

### 3. Sync status in settings

The provider rows on the Connected Data / Profile screen already show Connected and "Last sync 2h ago". Add to that same row, without changing the layout style:
- An "Updates automatically" note on Google and Outlook, so it is clear a connected calendar keeps working when the app is closed.
- A plain warning when the last sync is more than 24 hours old ("Not updated since Tuesday — reconnect"), so a silent failure is visible instead of invisible.
- A "Sync now" action on Google and Outlook rows that runs the existing sync and refreshes the line.

### 4. Verify on real accounts

After each step, replay live data: confirm the scheduled run returns success counts instead of forbidden, confirm fresh Google and Outlook meetings land in storage, and confirm a reminder for a non-iPhone account names a real meeting.

## Technical notes

- `cron.job` entries 1, 2, 5 (`refresh-calendar-tokens`, `sync-calendar-scheduled`, `register-calendar-watch-daily`) lack the `x-cron-secret` header; `_shared/cron-auth.ts` accepts only the service-role bearer or that header, so `net._http_response` shows `{"error":"forbidden"}` on every tick. Recreate via migration using the same vault-secret pattern as jobid 17/18.
- Jobs 3, 6, 7, 13, 14, 9 also lack the header — audit each against its function's auth check and fix the ones that are being rejected, in the same migration.
- Stale-token handling already exists in `sync-calendar` / `_shared/calendar-token-refresh.ts` and `_shared/connection-recovery.ts`; wire outcomes to it rather than adding logic.
- UI edits limited to `src/components/calendar/CalendarProviderPicker.tsx` (ProviderRow copy + optional sync action), reading `lastSync` already returned by `check-connections-status`.
- No schema change. Deploy any touched function alone.
