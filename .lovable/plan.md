# Engagement & Acquisition snapshot (admin)

Goal: one screen that tells you who arrived, where they dropped off, what they actually use, and how long they spend there — so nudges, emails and outreach can be triggered on real behaviour.

## 1. Count app opens, not downloads (iOS first, web too)

When the app opens, before any sign-in, it records an anonymous install: a random install ID kept on the device, first-open date, platform, country/timezone and app version. No identity, nothing Apple-restricted.

When that person later signs in, the install is linked to their account, so the funnel becomes visible end to end:

```text
opened -> started sign-up -> onboarding steps done -> finished onboarding -> subscribed
```

Installs that never sign in stay as anonymous rows — that is how the 19 September download becomes a visible "opened, never signed up".

## 2. Track page usage and time spent, across the whole app

Every screen view is recorded: which page, when, and how long the person stayed before moving on (timer pauses when the app is backgrounded, so idle time is not counted). Works signed-in and signed-out, on iPhone and web. Sends are batched and fire-and-forget — nothing user-facing changes, and a failed send never affects the app.

This gives: most-used pages, average and median time per page, pages nobody opens, last-active date per person, active days per week, and a simple engagement score you can trigger nudges or outreach from.

## 3. Ask for notifications on the welcome screen (iOS)

On the welcome screen, before sign-in, iOS is asked for quiet (provisional) notification permission using the mechanism already in the app. The device's push token is stored against the anonymous install.

A daily job then sends one gentle "finish setting up" reminder to installs that opened the app 2 days ago, never signed up, and have a working token — maximum two reminders per install, then it stops. No email, no identity needed. Anyone who signs up is dropped from that list immediately.

## 4. Acquisition & Engagement panel (admin)

Placed directly below the user table on the **Users** page, so it reads in one flow: the funnel and behaviour summary sit under the list of people it describes. Read-only except the manual download figure.

- **Funnel row** — opens, sign-ups, onboarding started, onboarding finished, subscribed, with conversion percentages between each step.
- **Manual App Store downloads** — an editable number per day (or per period) you type in from App Store Connect, shown next to opens so you can see how many downloads never opened.
- **Daily chart** — simple bars: opens vs sign-ups vs completions per day for the selected window (30/60/90 days).
- **Onboarding drop-off** — how many people stopped at each onboarding step, so you can see exactly where they leave.
- **Top pages** — page, views, unique people, average and median time spent, plus a "never opened" list.
- **Per-person engagement** — email, last active, days active, total minutes, most-used page, onboarding state, subscription state, and a "going quiet" flag (no activity for 5+ days). This is your outreach list.
- **Anonymous installs** — opened but never signed up: first-open date, platform, country, whether a reminder was sent. Nothing identifying, because Apple never provides it.
- Window selector and a Refresh button, with a "last refreshed" time.

## Technical notes

- New tables: `app_installs` (install_id, first_seen_at, platform, country, timezone, app_version, push token, notification_opt_in, reminders_sent, linked user_id, signup_at), `app_screen_views` (install_id, nullable user_id, route, entered_at, duration_ms, platform), `app_store_downloads` (date, count, entered_by). All with GRANTs; RLS deny-by-default for clients — all writes go through edge functions with the service role; admin reads via the admin guard.
- New edge function `track-app-usage`: accepts anonymous calls (`verify_jwt = false`), zod-validated body, upserts the install row, appends batched screen views, and links `user_id` when a valid bearer token is present. Route capped to a known-route allowlist plus `other` so free-text can't be injected.
- New edge function `admin-acquisition-analytics` behind `_shared/admin-guard.ts` (same pattern as `admin-recalibrate-analytics`), `?days=30|60|90`, read-only, writes an admin audit entry. Second small function `admin-set-app-store-downloads` for the manual figure.
- New edge function `send-install-signup-reminder` guarded by `_shared/cron-auth.ts`, scheduled daily via pg_cron with the `x-cron-secret` header (matching the working jobs), sending through the existing APNs sender; respects quiet hours and deactivates rejected tokens.
- Frontend: `src/utils/installId.ts` (persistent random ID), `src/hooks/useAppUsageTracking.ts` mounted once in `App.tsx` (router-location listener + Capacitor app-state pause/resume, batched flush on route change and backgrounding), provisional-permission request added to `Stage1Welcome.tsx` via the existing `requestProvisionalNotificationPermission` helper (no visual change), new `AcquisitionPanel.tsx` rendered under the table in `src/pages/admin/AdminUsers.tsx`.
- Everything additive. No existing screen, hook, edge function or table is modified apart from mounting the tracker in `App.tsx`, the permission call in `Stage1Welcome.tsx`, and appending the panel to `AdminUsers.tsx`. Tracking failures are always silent.
- Verify on iPhone first, then web: an open creates an install row with no sign-in, screen views accumulate with sensible durations, signing in links the install, and the admin panel shows the funnel and page times. Then confirm one reminder push reaches a test install that never signed up.
