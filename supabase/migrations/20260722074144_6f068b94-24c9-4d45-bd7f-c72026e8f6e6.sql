-- Add explicit target-week scope columns for Week Ahead → Plan exclusion contract.
ALTER TABLE public.event_priority_memory
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS effective_week_start date,
  ADD COLUMN IF NOT EXISTS effective_week_end date,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS resolved_event_id uuid,
  ADD COLUMN IF NOT EXISTS identity_confidence text;

-- Trigger-enforced integrity (avoids immutable-CHECK issues with defaults/now()).
CREATE OR REPLACE FUNCTION public.event_priority_memory_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scope IS NOT NULL AND NEW.scope NOT IN ('permanent','target_week','occurrence','category_week','none') THEN
    RAISE EXCEPTION 'invalid scope %', NEW.scope USING ERRCODE = '22023';
  END IF;

  IF NEW.scope = 'target_week' THEN
    IF NEW.effective_week_start IS NULL OR NEW.effective_week_end IS NULL THEN
      RAISE EXCEPTION 'scope=target_week requires effective_week_start and effective_week_end';
    END IF;
    IF NEW.effective_week_end < NEW.effective_week_start THEN
      RAISE EXCEPTION 'effective_week_end must be >= effective_week_start';
    END IF;
  END IF;

  IF NEW.scope = 'permanent' THEN
    NEW.effective_week_start := NULL;
    NEW.effective_week_end   := NULL;
  END IF;

  IF NEW.identity_confidence IS NOT NULL
     AND NEW.identity_confidence NOT IN ('resolved','ambiguous','unresolved') THEN
    RAISE EXCEPTION 'invalid identity_confidence %', NEW.identity_confidence;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_priority_memory_validate_scope ON public.event_priority_memory;
CREATE TRIGGER trg_event_priority_memory_validate_scope
  BEFORE INSERT OR UPDATE ON public.event_priority_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.event_priority_memory_validate_scope();

CREATE INDEX IF NOT EXISTS event_priority_memory_user_type_week_idx
  ON public.event_priority_memory (user_id, event_category, event_type_key, effective_week_start, occurred_at DESC);

CREATE INDEX IF NOT EXISTS event_priority_memory_user_resolved_event_idx
  ON public.event_priority_memory (user_id, resolved_event_id, effective_week_start)
  WHERE resolved_event_id IS NOT NULL;