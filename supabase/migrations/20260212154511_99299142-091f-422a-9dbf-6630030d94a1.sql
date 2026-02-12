
-- Add unique constraint for upsert support on calendar_event_classifications
ALTER TABLE public.calendar_event_classifications
  ADD CONSTRAINT calendar_event_classifications_user_event_unique
  UNIQUE (user_id, calendar_event_id);
