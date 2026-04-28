-- Add structured signal-pill, wearable, and check-in snapshots to brief_snapshots
-- so the entire Performance Readiness Brief (score, phrase, body, pills, raw
-- wearable evidence, and check-in inputs) lives in one row.
ALTER TABLE public.brief_snapshots
  ADD COLUMN IF NOT EXISTS signal_pills jsonb,
  ADD COLUMN IF NOT EXISTS wearable_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS checkin_snapshot jsonb;

-- Update the user-update guard so users still cannot tamper with these fields
-- (only service role writes are permitted).
CREATE OR REPLACE FUNCTION public.brief_snapshots_user_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.local_date IS DISTINCT FROM OLD.local_date
     OR NEW.time_window IS DISTINCT FROM OLD.time_window
     OR NEW.input_signature IS DISTINCT FROM OLD.input_signature
     OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
     OR NEW.phrase IS DISTINCT FROM OLD.phrase
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.lean_on IS DISTINCT FROM OLD.lean_on
     OR NEW.lean_on_source IS DISTINCT FROM OLD.lean_on_source
     OR NEW.watch_for IS DISTINCT FROM OLD.watch_for
     OR NEW.watch_for_source IS DISTINCT FROM OLD.watch_for_source
     OR NEW.brief_source IS DISTINCT FROM OLD.brief_source
     OR NEW.driver IS DISTINCT FROM OLD.driver
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
     OR NEW.signal_pills IS DISTINCT FROM OLD.signal_pills
     OR NEW.wearable_snapshot IS DISTINCT FROM OLD.wearable_snapshot
     OR NEW.checkin_snapshot IS DISTINCT FROM OLD.checkin_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.daily_checkin_id IS DISTINCT FROM OLD.daily_checkin_id
  THEN
    RAISE EXCEPTION 'Only user_rating and feedback_text may be updated by users';
  END IF;

  RETURN NEW;
END;
$function$;