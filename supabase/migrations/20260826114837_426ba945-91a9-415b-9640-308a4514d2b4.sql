ALTER TABLE public.event_outcome_feedback
DROP CONSTRAINT IF EXISTS event_outcome_feedback_rating_check;

ALTER TABLE public.event_outcome_feedback
ADD CONSTRAINT event_outcome_feedback_rating_check
CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.daily_ritual_completions_completion_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.completion_status IN ('partial', 'full')
     AND COALESCE(array_length(NEW.completed_practice_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'partial/full ritual completions require at least one completed practice id'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(array_length(NEW.completed_practice_ids, 1), 0) > 0
     AND NEW.practice_completed_at IS NULL THEN
    RAISE EXCEPTION 'completed practice ids require practice_completed_at'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS daily_ritual_completions_completion_integrity_guard_trg
ON public.daily_ritual_completions;

CREATE TRIGGER daily_ritual_completions_completion_integrity_guard_trg
BEFORE INSERT OR UPDATE ON public.daily_ritual_completions
FOR EACH ROW
EXECUTE FUNCTION public.daily_ritual_completions_completion_integrity_guard();