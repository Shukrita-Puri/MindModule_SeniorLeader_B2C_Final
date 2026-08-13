DROP VIEW IF EXISTS public.primary_calendar_events;

CREATE VIEW public.primary_calendar_events
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

GRANT SELECT ON public.primary_calendar_events TO authenticated;
GRANT ALL ON public.primary_calendar_events TO service_role;