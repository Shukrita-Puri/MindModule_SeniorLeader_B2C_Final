# Acquisition & engagement — one row per person

Replace the mixed charts-and-totals panel with a single wide table, read the same way as the Users table: every row is one person, every column is a measure for that person. Same metrics as today, nothing new measured, nothing aggregated away.

## The table

One row per person (everyone with an account, plus one row per anonymous install that never signed up).

Columns:

- Name, Email, User ID
- Platform, Country (from the device that opened the app)
- Funnel stage — Opened / Signed up / Onboarding started / Onboarding finished / Subscribed (furthest reached)
- Onboarding stage — the furthest step reached, and "Completed" when finished
- First open, Sign-up date, Last active
- Active days, Total views, Total minutes, Avg minutes per session
- Most-used page
- Subscription
- Status — Active or Going quiet (5+ quiet days)

Sorted by last active. Search box filters on name, email or ID, same behaviour as the Users table above it.

## Per-feature detail, per person

Each row expands to show that person's own page breakdown — one line per feature/page they used: page, views, avg time, median time, total minutes, last opened. Pages they never opened are listed as not used, so the gaps are visible per person rather than only app-wide.

The onboarding stage cell expands too: every onboarding step for that person with the date it was reached, or blank where they stopped.

## What goes away

The app-wide charts and consolidated tables that caused the confusion: the daily bar chart, the app-wide "onboarding steps reached" bars, "still sitting at" badges, and the app-wide "pages used most" table. Their content now lives per person inside the rows.

## What stays

- The funnel summary strip at the top (downloads, opened, signed up, onboarding started, finished, subscribed with conversion percentages) — a count-level summary, unchanged.
- The manual App Store downloads entry (Apple never says who downloaded, so it can only ever be a count).
- Window selector (7/30/60/90), Refresh, last-refreshed time.

## Technical notes

- `supabase/functions/admin-acquisition-analytics/index.ts` — reshape the response into a single `people` array. Each entry carries identity (from `profiles`), install context (platform, country, first open, from `app_installs` linked by `user_id`), funnel stage, per-step onboarding timestamps (from `onboarding_progress`), engagement aggregates, session count for avg-minutes-per-session (views grouped by day + install), and a nested `pages[]` breakdown from that person's own `app_screen_views` rows. Anonymous installs are appended as identity-less entries so the funnel's first stage is visible per device. Keep `funnel`, `daily` totals used by the strip, `totals`, and `manualDownloadsByDate`; drop the app-wide `topPages`, `onboardingSteps`, `stuckAt` aggregates. Still read-only, same admin guard and audit entry.
- `src/components/admin/AcquisitionPanel.tsx` — rewrite the body as the expandable per-person table (row click toggles the detail rows), keep header/window/downloads block. Route list for "never opened" comes from the known-route allowlist already used by `track-app-usage`.
- No schema change, no tracking change, no other screen or function touched. Typecheck, deno check, and the existing test suite before finishing.

## Safe change — admin panel only

Only two files change: the admin panel component and the admin-only read function behind it. Nothing the app's users see or use is touched — no tracking, no notifications, no brief, plan, reminders, sync, check-ins or subscriptions, no database structure, and no other admin page. The function stays read-only behind the same admin check. If anything about the new table is unwelcome it can be reverted on its own, with all collected data intact.
