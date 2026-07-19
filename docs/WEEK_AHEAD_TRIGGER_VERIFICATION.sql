-- Week-Ahead picker invite — verification queries.
-- Use these to confirm the end_of_pto / end_of_public_holiday /
-- end_of_long_weekend / weekly_planning branches fire in prod.
--
-- Send ledger:  notification_log
-- Reason key:   variant_id LIKE '%::<reason>' where <reason> is one of
--               weekly_planning | end_of_pto |
--               end_of_public_holiday | end_of_long_weekend |
--               manual_override
-- Structured log: filter Edge function logs for `[week-ahead-trigger]`.
-- Hydration log:  filter Edge function logs for `[week-ahead-hydration]`
--                 — emitted whenever any upstream source returned empty
--                 and the evaluator fell back to a safe default.
-- Kill switch:    secret WEEK_AHEAD_PICKER_ENABLED (set to 'false' to
--                 disable without a deploy; any other value = enabled).
-- Idempotency:    per-reason, per-day. The same reason cannot fire twice
--                 on the same UTC day for the same user; different
--                 reasons on the same day are permitted (e.g. an
--                 end_of_pto Thursday and a weekly_planning Sunday in
--                 the same ISO week both fire).
-- Cap bucket:     own bucket — exempt from DAILY_NOTIFICATION_CAP, the
--                 2-hour intra-tick suppression, APP_OPEN_COOLDOWN_MS,
--                 and the per-window slot cap.
--
-- Reason-collision guard: the `LIKE '%::<reason>'` and
-- `split_part(payload->>'variant_id', '::', 2)` patterns below assume no
-- valid week-ahead reason is a suffix of another. Enforced by the unit
-- test `WEEK_AHEAD_REASONS: no reason is a suffix of another` in
-- supabase/functions/_shared/plan/week-ahead-reasons.test.ts. Reasons
-- are exported from supabase/functions/_shared/plan/week-ahead-nudge.ts
-- as `WEEK_AHEAD_REASONS`. When adding a new reason there, the test
-- will fail loudly on collision — fix the reason name, not the test.
--
-- Walk-back date granularity (consecutiveOffDaysBefore): the 14-day
-- look-back used to detect long weekends / holiday blocks operates at
-- UTC calendar-day granularity (cursor.toISOString().slice(0,10)).
-- Around DST transitions in the user's local timezone this can mis-
-- attribute a single day's off-status by ±1 calendar day. The realistic
-- blast radius is ~1–2 fires per year per affected user (spring-forward
-- + fall-back). Accepted tradeoff; see the doc-comment block above the
-- walk-back loop in supabase/functions/smart-nudges/index.ts for the
-- full DST writeup and a fix-size estimate.

-- (1) How many week-ahead picker invites fired in the last 7 days, by reason
SELECT
  split_part(payload->>'variant_id', '::', 2) AS reason,
  COUNT(*) AS sends,
  COUNT(DISTINCT user_id) AS users
FROM notification_log
WHERE notification_type = 'week_ahead_picker_invite'
  AND sent_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY sends DESC;

-- (1b) Per-reason, per-day idempotency audit — any user with >1 picker
-- invite for the SAME reason on the SAME UTC day is a bug (server-side
-- dedupe should make this impossible). Multiple reasons on the same day
-- are allowed by design.
SELECT
  user_id,
  date_trunc('day', sent_at) AS day,
  split_part(payload->>'variant_id', '::', 2) AS reason,
  COUNT(*) AS invites,
  array_agg(sent_at ORDER BY sent_at) AS sent_ats
FROM notification_log
WHERE notification_type = 'week_ahead_picker_invite'
  AND sent_at >= now() - interval '60 days'
GROUP BY user_id, date_trunc('day', sent_at), reason
HAVING COUNT(*) > 1
ORDER BY day DESC;

-- (2) Users who had a PTO/holiday block end in the last 30 days but did NOT
-- receive an end_of_pto / end_of_public_holiday invite on the return day.
-- (Use to spot-check that the trigger fired when it should have.)
WITH pto_days AS (
  SELECT user_id, date(start_time) AS d
  FROM primary_calendar_events
  WHERE title ~* '\m(ooo|pto|vacation|annual leave|on leave|out of office|holiday|bank holiday|public holiday|national holiday)\M'
    AND start_time >= now() - interval '30 days'
),
blocks AS (
  SELECT
    user_id,
    d,
    d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int AS grp
  FROM pto_days
),
last_day_of_block AS (
  SELECT user_id, MAX(d) AS last_off_day
  FROM blocks
  GROUP BY user_id, grp
),
sent AS (
  SELECT user_id, date(sent_at) AS d
  FROM notification_log
  WHERE notification_type = 'week_ahead_picker_invite'
    AND payload->>'variant_id' LIKE '%::end_of_pto'
    AND sent_at >= now() - interval '30 days'
)
SELECT l.user_id, l.last_off_day
FROM last_day_of_block l
LEFT JOIN sent s ON s.user_id = l.user_id AND s.d = l.last_off_day
WHERE s.user_id IS NULL
ORDER BY l.last_off_day DESC;

-- (3) Per-user trigger telemetry for one user (last 14 days). Cross-check
-- against `[week-ahead-trigger]` lines in Edge logs.
-- Replace :user_id before running.
-- SELECT id, notification_type, payload->>'variant_id' AS reason,
--        sent_at, delivered_at
-- FROM notification_log
-- WHERE user_id = :user_id
--   AND notification_type = 'week_ahead_picker_invite'
--   AND sent_at >= now() - interval '14 days'
-- ORDER BY sent_at DESC;