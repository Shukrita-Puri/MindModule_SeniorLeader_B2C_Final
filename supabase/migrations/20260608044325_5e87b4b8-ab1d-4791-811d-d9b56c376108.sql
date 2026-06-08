ALTER TABLE public.event_priority_memory
  DROP CONSTRAINT IF EXISTS event_priority_memory_source_chk;
ALTER TABLE public.event_priority_memory
  ADD CONSTRAINT event_priority_memory_source_chk
    CHECK (source = ANY (ARRAY['week_ahead_picker'::text,'priority_tag'::text,'cancel_feedback'::text,'post_plan_feedback'::text]));