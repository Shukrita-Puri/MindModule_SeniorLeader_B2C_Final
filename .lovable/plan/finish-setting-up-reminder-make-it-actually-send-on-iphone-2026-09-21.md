# "Finish setting up" reminder — make it actually send on iPhone

The daily job, the store for anonymous installs and the push sender all exist. What is missing is
the part that gives the job something to send to: today no install has a notification opt-in and no
install has a device token, so every run finds zero candidates.

## What I found (from live data and the code)

- 8 installs recorded, 7 of them with no account. **None** on iPhone, **none** opted in, **none**
  with a device token. So the reminder job runs daily and correctly does nothing.
- The quiet notification ask only happens on the onboarding welcome screen. Someone who opens the
  app and never taps through to onboarding is never asked, so never becomes reachable.
- Even when the ask succeeds, the token can be lost: the recording call shares a single
  "one send at a time" guard with ordinary screen-time pings, and when a ping is already in flight
  the token is dropped instead of being kept for the next send.
- Spacing is already effectively day 2 then day 5, but it is expressed as "wait 2 days, then 3 days
  between sends", which drifts if a run is skipped. It will be stated as explicit day 2 and day 5.
- After someone signs up they stop being a candidate (the job only looks at installs with no
  account), but their device token stays stored. It will be cleared at the moment of sign-up.

## Changes

1. **Ask on first open, on iPhone, wherever the app opens.** Move the quiet ask so it runs once per
   device shortly after the app is ready, instead of only on the onboarding welcome screen. Still
   iOS-only, still the silent (provisional) request — no visible prompt, nothing to accept, nothing
   blocking. Still attempted at most once per device.

2. **Never lose the token.** The opt-in/token record gets its own send path so it can't be dropped
   because a screen-time ping happens to be in flight, and it retries once on failure. Screen-time
   behaviour is unchanged.

3. **Fixed day 2 and day 5 spacing.** The job sends reminder 1 on day 2 after first open and
   reminder 2 on day 5, based on the install's own first-open date rather than a rolling gap, with
   a short grace window so a missed run still sends late rather than never. Maximum two reminders,
   then the install is never contacted again.

4. **Drop the install from the list the instant someone signs up.** When an install is linked to an
   account, its stored device token is cleared and its notification opt-in is turned off in the same
   write, so it can never be picked up again even if the reminder rules later change.

## Safety

Isolated to the reminder path and the anonymous-install record. Nothing in the brief, plan, daily
reminders, check-ins, calendar sync, readiness or subscriptions is touched, and no user-facing
screen changes. The existing reminder engine, notification log and device-token table are untouched:
this reminder only ever targets a device with no account attached. Every new step fails silently.

## Technical notes

- `src/utils/preSignupNotificationOptIn.ts` — unchanged logic, invoked from the app shell
  (`AppUsageTracker`) on mount instead of from `Stage1Welcome.tsx`; the call in `Stage1Welcome.tsx`
  is removed so there is exactly one trigger.
- `src/hooks/useAppUsageTracking.ts` — `recordInstallNotificationState` sends directly (own request,
  bypasses the `flushing` guard, one retry), leaving `flushUsage` for view batches.
- `supabase/functions/send-install-signup-reminder/index.ts` — replace `COOLDOWN_DAYS` with
  `REMINDER_DAY_OFFSETS = [2, 5]`: a candidate qualifies when
  `days_since_first_seen >= offsets[signup_reminders_sent]`; keep `MAX_REMINDERS = 2`, quiet hours,
  iOS-only, and the dead-token cleanup on `BadDeviceToken` / `Unregistered`.
- `supabase/functions/track-app-usage/index.ts` — when setting `user_id`/`linked_at`, also set
  `device_token = null` and `notification_opt_in = false`.
- Deploy `track-app-usage` and `send-install-signup-reminder` separately; existing pg_cron job
  `install-signup-reminder-daily` (11:00 UTC) is unchanged.
- Verify: `deno check` on both functions, typecheck and the vitest suite, a signed-out iPhone open
  produces an `app_installs` row with `platform = 'ios'`, opt-in true and a 64-hex token, and a
  forced run of the job returns a send for a test install older than 2 days.
