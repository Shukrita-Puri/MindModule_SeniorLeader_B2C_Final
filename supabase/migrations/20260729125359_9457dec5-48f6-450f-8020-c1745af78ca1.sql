ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_category CHAR(1),
  ADD COLUMN IF NOT EXISTS event_subcategory VARCHAR(30),
  ADD COLUMN IF NOT EXISTS flight_duration_minutes INT;

CREATE INDEX IF NOT EXISTS calendar_events_category_idx
  ON public.calendar_events (event_category)
  WHERE event_category IS NOT NULL;