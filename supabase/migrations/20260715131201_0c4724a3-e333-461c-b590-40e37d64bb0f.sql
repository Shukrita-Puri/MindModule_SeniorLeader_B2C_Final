-- Add missing profiles.country column referenced by smart-nudges availability classifier
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;

-- Recreate web_primary_calendar_events view to include is_all_day (added to calendar_events but not backfilled into the view)
CREATE OR REPLACE VIEW public.web_primary_calendar_events AS
SELECT id, user_id, external_id, title, start_time, end_time,
       attendees_count, is_organizer, is_recurring, event_metadata,
       created_at, provider, is_all_day
FROM calendar_events e
WHERE provider = ((
  SELECT c.provider
  FROM calendar_connections c
  WHERE c.user_id = e.user_id
    AND c.is_active = true
    AND c.provider = ANY (ARRAY['apple','google','microsoft'])
    AND EXISTS (
      SELECT 1 FROM calendar_events e2
      WHERE e2.user_id = e.user_id AND e2.provider = c.provider
    )
  ORDER BY (
    CASE c.provider
      WHEN 'google'    THEN 1
      WHEN 'microsoft' THEN 2
      WHEN 'apple'     THEN 3
      ELSE NULL
    END
  )
  LIMIT 1
));

ALTER VIEW public.web_primary_calendar_events SET (security_invoker = true);
GRANT SELECT ON public.web_primary_calendar_events TO authenticated, service_role, anon;
