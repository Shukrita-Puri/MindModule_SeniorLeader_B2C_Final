
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false;

-- Backfill from existing metadata (Apple/Google/Microsoft variants).
UPDATE public.calendar_events
SET is_all_day = true
WHERE is_all_day = false
  AND (
       (event_metadata ->> 'isAllDay') IN ('true','TRUE','True','1')
    OR (event_metadata ->> 'is_all_day') IN ('true','TRUE','True','1')
    OR (event_metadata ->> 'allDay') IN ('true','TRUE','True','1')
  );
