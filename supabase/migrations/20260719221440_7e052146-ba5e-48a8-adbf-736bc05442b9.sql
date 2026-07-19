ALTER TABLE public.event_priority_memory
  ADD COLUMN IF NOT EXISTS event_subcategory text;

CREATE INDEX IF NOT EXISTS event_priority_memory_user_subcategory_idx
  ON public.event_priority_memory (user_id, event_subcategory, occurred_at DESC)
  WHERE event_subcategory IS NOT NULL;

COMMENT ON COLUMN public.event_priority_memory.event_subcategory IS
  'Optional second-level tag derived from subtype id (e.g. deep_work, long_haul, board_meeting). Nullable for backward compatibility.';