-- F2.2 Schema: Add event_category, event_subcategory, flight_duration_minutes to calendar_events
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_category CHAR(1),
  ADD COLUMN IF NOT EXISTS event_subcategory VARCHAR(30),
  ADD COLUMN IF NOT EXISTS flight_duration_minutes INT;

-- Add index for faster querying by category
CREATE INDEX IF NOT EXISTS calendar_events_category_idx
  ON public.calendar_events (event_category)
  WHERE event_category IS NOT NULL;

-- Recreate the view to include the new columns
CREATE OR REPLACE VIEW public.primary_calendar_events
WITH (security_invoker = true)
AS
SELECT e.*
FROM public.calendar_events e
WHERE e.provider = (
  SELECT c.provider
  FROM public.calendar_connections c
  WHERE c.user_id = e.user_id
    AND c.is_active = true
    AND c.provider IN ('apple', 'google', 'microsoft')
    AND EXISTS (
      SELECT 1 FROM public.calendar_events e2
      WHERE e2.user_id = e.user_id AND e2.provider = c.provider
    )
  ORDER BY CASE c.provider
    WHEN 'apple' THEN 1
    WHEN 'google' THEN 2
    WHEN 'microsoft' THEN 3
  END
  LIMIT 1
);
