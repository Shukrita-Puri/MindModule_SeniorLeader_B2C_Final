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
  ORDER BY CASE c.provider
    WHEN 'apple' THEN 1
    WHEN 'google' THEN 2
    WHEN 'microsoft' THEN 3
  END
  LIMIT 1
);

COMMENT ON VIEW public.primary_calendar_events IS
'Per-user single-provider view of calendar_events. Precedence: apple > google > microsoft. Used by brief, nudges, mastery plan, JIT to avoid double-counting.';