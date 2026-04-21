-- Replace correlation view to include HR + RHR alongside HRV
DROP VIEW IF EXISTS public.event_physiology_join;

CREATE VIEW public.event_physiology_join 
WITH (security_invoker = true)
AS
SELECT 
  e.user_id,
  e.id AS event_id,
  e.title,
  e.start_time,
  e.end_time,
  e.event_metadata->>'eventType' AS event_type,
  COALESCE((e.event_metadata->>'isHighStakes')::boolean, false) AS is_high_stakes,
  e.attendees_count,
  e.is_organizer,

  -- HRV (existing)
  w_before.hrv AS hrv_morning_of,
  w_after.hrv AS hrv_next_morning,
  (w_after.hrv - w_before.hrv) AS hrv_delta,

  -- Resting Heart Rate (NEW) — opposite direction to HRV: rises under stress
  w_before.resting_heart_rate AS rhr_morning_of,
  w_after.resting_heart_rate AS rhr_next_morning,
  (w_after.resting_heart_rate - w_before.resting_heart_rate) AS rhr_delta,

  -- Daily peak Heart Rate (NEW) — useful for acute spike detection
  w_before.heart_rate AS hr_morning_of,
  w_after.heart_rate AS hr_next_morning,
  (w_after.heart_rate - w_before.heart_rate) AS hr_delta,

  -- Sleep context (NEW) — sleep quality the night BEFORE the event often predicts response
  w_before.sleep_score AS sleep_score_night_before,
  w_before.total_sleep_minutes AS sleep_minutes_night_before

FROM public.calendar_events e
LEFT JOIN public.wearable_data w_before
  ON w_before.user_id = e.user_id
  AND w_before.summary_date = (e.start_time AT TIME ZONE 'UTC')::date
LEFT JOIN public.wearable_data w_after
  ON w_after.user_id = e.user_id
  AND w_after.summary_date = (e.start_time AT TIME ZONE 'UTC')::date + INTERVAL '1 day'
WHERE e.start_time < now() - INTERVAL '12 hours';

COMMENT ON VIEW public.event_physiology_join IS
  'Joins past calendar events with morning-of and next-morning physiology (HRV, RHR, HR peak, sleep). Powers HR/HRV-event correlation insights. Security invoker = inherits caller RLS.';
