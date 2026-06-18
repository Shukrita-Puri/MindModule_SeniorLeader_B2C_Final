ALTER TABLE public.event_priority_memory
  DROP CONSTRAINT IF EXISTS event_priority_memory_signal_chk;

ALTER TABLE public.event_priority_memory
  ADD CONSTRAINT event_priority_memory_signal_chk
  CHECK (signal = ANY (ARRAY[
    'priority',
    'not_this_week',
    'never',
    'cancelled_as_noise',
    'cancelled_keep_surfacing',
    'tag_importance_high',
    'tag_importance_medium',
    'tag_importance_low',
    'tag_relationship',
    'tag_custom',
    'tag_cleared'
  ]));