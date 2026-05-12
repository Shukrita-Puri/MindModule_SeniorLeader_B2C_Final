CREATE OR REPLACE VIEW public.primary_calendar_events
WITH (security_invoker = true)
AS
SELECT e.*
FROM public.calendar_events e
WHERE e.provider = (
  -- Pick the highest-precedence active provider that ALSO has at least one
  -- event stored for this user. This avoids empty windows when a user has
  -- just connected Apple but the iOS app hasn't synced events yet.
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