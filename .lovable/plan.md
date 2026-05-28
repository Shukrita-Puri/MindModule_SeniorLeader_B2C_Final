Reuse existing DBs — no new tables, no new writes to `inner_readiness_scores`.

## What we already have

- `brief_snapshots` — one row per generated brief, scoped to `(user_id, local_date, time_window)`. Stores `score`, `tier`, `checkin_snapshot`, `daily_checkin_id`. This is the same table the side panel ("past briefs") reads via `brief-history`.
- `daily_checkins` — already powers the Performance Rhythm trend calendars (Clarity / Emotion / Pressure / Regulation) via the `level-trend-calendar` edge function.

Both tables are scoped by Auth0 `userId` inside edge functions using the service role. RLS deny-by-default is preserved.

## 1. Inner Readiness Dial — read from `brief_snapshots`

- Extend `brief-history` (or add a thin sibling action) to accept a date range and return:
  `{ local_date, time_window, score, tier, created_at }` for the requested week.
- `InnerReadinessDial` calls this endpoint instead of reading `inner_readiness_scores` / `daily_checkins` directly.
- Daily dot resolution:
  1. Group all snapshot rows for the day.
  2. If ≥1 numeric `score`, average them → tier.
  3. Else dot stays empty.
- Today's centre number continues to come from `useOuterReadiness` (live brief).
- No writes to `inner_readiness_scores`. We leave that table alone.

## 2. Performance Streaks — read from `daily_checkins` (same source as Rhythm card)

- Add a new action `GET_MONTHLY_LEVELS` to the existing `daily-checkins` edge function returning, for the current calendar month and authenticated user:
  `[{ checkin_date, clarity_level, emotion_level, pressure_level, regulation_level }]`.
- `PerformanceStreaks` calls this action via `supabase.functions.invoke('daily-checkins', …)` — exactly the auth-scoped pattern Rhythm already uses — instead of `supabase.from('daily_checkins')` directly from the browser (which RLS deny-by-default blocks for Auth0 sessions, leaving the card empty).
- Counting logic in `computeDimensionStreaks` is unchanged: Peak = any slot ≥4, Friction = any slot ≤2, neutral excluded, a day can contribute to both.

## 3. Validation

- Confirm dial dots populate for Mon–today from `brief_snapshots` for the active user.
- Confirm Performance Streak thumbs show non-zero counts matching the DB cross-check already run (clarity peak 20, friction 3; emotion 11/1; pressure 11/1; regulation 11/0 for this month).
- Confirm both cards render for an Auth0-authenticated user (not just DEV_MODE) and no direct `supabase.from(...)` browser reads remain on protected tables for these two cards.

## Files touched

- `supabase/functions/brief-history/index.ts` — accept optional `startDate`/`endDate` filter and project the lightweight fields the dial needs.
- `supabase/functions/daily-checkins/index.ts` — add `GET_MONTHLY_LEVELS` action.
- `src/components/insights/InnerReadinessDial.tsx` — call the brief-history endpoint, drop direct table reads.
- `src/components/insights/PerformanceStreaks.tsx` — call `daily-checkins` edge function, drop direct table read.

No migrations. No new tables. No new writes.