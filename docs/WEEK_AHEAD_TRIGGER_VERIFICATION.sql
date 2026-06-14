-- Week-Ahead picker invite — verification queries.
-- Use these after the trigger-hydration fix to confirm the last_day_pto /
-- last_day_holiday / last_day_long_weekend branches actually fire in prod.
--
-- Send ledger:  notification_log
-- Reason key:   variant_id LIKE '%::<reason>' where <reason> is one of
--               sunday_evening | last_day_pto_evening |
--               last_day_holiday_evening | last_day_long_weekend_evening
-- Structured log: filter Edge function logs for `[week-ahead-trigger]`.
-- Hydration log:  filter Edge function logs for `[week-ahead-hydration]`
--                 — emitted whenever any upstream source returned empty
--                 and the evaluator fell back to a safe default.
-- Kill switch:    secret WEEK_AHEAD_PICKER_ENABLED (set to 'false' to
--                 disable without a deploy; any other value = enabled).
-- Idempotency:    one invite per ISO week per user (Mon 00:00 local →
--                 next Mon 00:00 local). Enforced server-side by the
--                 weekly notification_log lookup BEFORE dispatch.
-- Cap bucket:     own bucket — exempt from DAILY_NOTIFICATION_CAP, the
--                 2-hour intra-tick suppression, APP_OPEN_COOLDOWN_MS,
--                 and the per-window slot cap.

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

-- (1b) ISO-week idempotency audit — any user with >1 picker invite in the
-- same ISO week is a bug (server-side dedupe should make this impossible).
SELECT
  user_id,
  date_trunc('week', sent_at) AS iso_week_start,
  COUNT(*) AS invites,
  array_agg(split_part(payload->>'variant_id', '::', 2) ORDER BY sent_at) AS reasons,
  array_agg(sent_at ORDER BY sent_at) AS sent_ats
FROM notification_log
WHERE notification_type = 'week_ahead_picker_invite'
  AND sent_at >= now() - interval '60 days'
GROUP BY user_id, date_trunc('week', sent_at)
HAVING COUNT(*) > 1
ORDER BY iso_week_start DESC;

-- (2) Users who had a PTO/holiday block end in the last 30 days but did NOT
-- receive a last_day_pto_evening / last_day_holiday_evening invite on the
-- return day. (Use to spot-check that the trigger fired when it should have.)
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
    AND payload->>'variant_id' LIKE '%::last_day_pto_evening'
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