ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_user_external_unique UNIQUE (user_id, external_id);

ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS webhook_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_expiration TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS calendar_connections_webhook_expiration_idx
  ON public.calendar_connections (webhook_expiration)
  WHERE webhook_expiration IS NOT NULL;

CREATE OR REPLACE VIEW public.event_physiology_join AS
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
  w_before.hrv AS hrv_morning_of,
  w_after.hrv AS hrv_next_morning,
  CASE
    WHEN w_before.hrv IS NOT NULL AND w_after.hrv IS NOT NULL
    THEN w_after.hrv - w_before.hrv
    ELSE NULL
  END AS hrv_delta,
  w_after.resting_heart_rate AS rhr_next_morning,
  w_after.total_sleep_minutes AS sleep_minutes_next_night
FROM public.calendar_events e
LEFT JOIN public.wearable_data w_before
  ON w_before.user_id = e.user_id
  AND w_before.summary_date = (e.start_time AT TIME ZONE 'UTC')::date
LEFT JOIN public.wearable_data w_after
  ON w_after.user_id = e.user_id
  AND w_after.summary_date = ((e.start_time AT TIME ZONE 'UTC')::date + INTERVAL '1 day')::date
WHERE e.start_time < now() - INTERVAL '12 hours';

CREATE OR REPLACE FUNCTION public.cleanup_old_calendar_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.calendar_events
  WHERE start_time < (now() - INTERVAL '90 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;