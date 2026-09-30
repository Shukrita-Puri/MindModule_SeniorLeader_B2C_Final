-- Update calendar retention cleanup window from 90 days to 365 days (Stage B Step 11)
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
  WHERE start_time < (now() - INTERVAL '365 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
