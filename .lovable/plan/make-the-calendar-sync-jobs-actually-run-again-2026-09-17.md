# Make the calendar sync jobs actually run again

## What I found

The whole background sync system already exists and is scheduled — Google/Outlook sync every 30 minutes, token refresh every 10 minutes, calendar change-watch daily. The jobs are firing on time. They are being rejected.

Every run comes back `403 forbidden`. The functions require a shared secret in the request; these particular scheduled jobs never send it, so the request is turned away before any work happens — no logs, no sync, silently, on every tick.

Consequences, confirmed in live data:
- Newest Google meeting stored: 3 September. No Outlook meeting has ever been stored.
- Every stored Google/Outlook access token expired weeks ago (token refresh is rejected too).
- Because reminders read stored meetings, they describe a stale calendar — which is exactly the "AI Conference at 1pm, 3 hours ago" message Shukrita received for a meeting she had already deleted.

Apple Calendar is unaffected because it syncs from the phone, which is why iPhone-only accounts looked fine.

## Changes

### 1. Let the scheduled jobs through

Recreate the rejected schedules so they send the shared secret the functions require, exactly as the schedules that already work today do (travel sync, early-morning sync, recovery push):
- calendar sync (every 30 minutes)
- calendar token refresh (every 10 minutes)
- calendar change-watch (daily)

Audit the other schedules in the same list against their function's check and fix any that are also being rejected, in the same change. No function code changes — the security check stays as strict as it is.

### 2. Recover the connections that expired while sync was down

Once the jobs run, tokens refresh again. Connections whose refresh token was invalidated during the weeks of failure cannot recover on their own; those get marked as needing reconnect through the mechanism that already exists, so the person is prompted by the existing flow rather than failing silently.

Also confirm that a sync which finds a deleted meeting removes it from storage, so a cancelled meeting stops appearing in reminders.

### 3. Verify on Shukrita's real account — iPhone first, then web

Order of work and testing: get it right on the iPhone path first, then confirm the same on web.

- A scheduled run returns success counts instead of `forbidden`.
- Fresh Google and Outlook meetings land in storage, and a meeting deleted in Google disappears within one cycle — with the app closed the whole time.
- On iPhone: her stored meetings match her real calendar, and her next reminder names a meeting that still exists.
- On web: the same account shows the same meetings, with no stale entry like the deleted AI Conference.

## Not doing

No UI changes. The sync status, last-sync line, reconnect state and connection prompts already exist in the profile screens and are left untouched.

## Technical notes

- `cron.job` 1, 2, 5 (`refresh-calendar-tokens`, `sync-calendar-scheduled`, `register-calendar-watch-daily`) omit the `x-cron-secret` header; `_shared/cron-auth.ts` accepts only the service-role bearer or that header, so `net._http_response` records `{"error":"forbidden"}` on every tick. Recreate via `cron.schedule` using `public.get_cron_shared_secret()`, same pattern as jobs 17/18 and `supabase/sql/schedule_morning_jobs_0430.sql`.
- Jobs 3, 6, 7, 9, 13, 14 also omit the header — check each against its function's auth path and fix the rejected ones in the same statement.
- Stale-token and reconnect handling already exist in `sync-calendar`, `_shared/calendar-token-refresh.ts` and `_shared/connection-recovery.ts`; wire outcomes to them rather than adding logic.
- Verify `sync-calendar`'s delete/reconcile path removes events no longer present in the provider window.
- No schema change, no frontend change. Deploy any touched function alone.
