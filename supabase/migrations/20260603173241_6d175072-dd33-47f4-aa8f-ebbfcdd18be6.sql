-- 1a. Rename existing columns -> refined_*
ALTER TABLE public.brief_snapshots RENAME COLUMN score TO refined_score;
ALTER TABLE public.brief_snapshots RENAME COLUMN tier TO refined_tier;
ALTER TABLE public.brief_snapshots RENAME COLUMN phrase TO refined_phrase;
ALTER TABLE public.brief_snapshots RENAME COLUMN body_text TO refined_body_text;
ALTER TABLE public.brief_snapshots RENAME COLUMN lean_on TO refined_lean_on;
ALTER TABLE public.brief_snapshots RENAME COLUMN lean_on_source TO refined_lean_on_source;
ALTER TABLE public.brief_snapshots RENAME COLUMN watch_for TO refined_watch_for;
ALTER TABLE public.brief_snapshots RENAME COLUMN watch_for_source TO refined_watch_for_source;
ALTER TABLE public.brief_snapshots RENAME COLUMN signal_pills TO refined_signal_pills;

-- 1b. Add baseline_* and state columns
ALTER TABLE public.brief_snapshots
  ADD COLUMN baseline_score            int   NULL,
  ADD COLUMN baseline_tier             text  NULL,
  ADD COLUMN baseline_phrase           text  NULL,
  ADD COLUMN baseline_body_text        text  NULL,
  ADD COLUMN baseline_lean_on          text  NULL,
  ADD COLUMN baseline_lean_on_source   text  NULL,
  ADD COLUMN baseline_watch_for        text  NULL,
  ADD COLUMN baseline_watch_for_source text  NULL,
  ADD COLUMN baseline_signal_pills     jsonb NULL,
  ADD COLUMN baseline_state            text  NULL,
  ADD COLUMN refined_state             text  NULL;

-- 1c. ±15 constraint (NULL-tolerant for historical rows)
ALTER TABLE public.brief_snapshots
  ADD CONSTRAINT refined_score_within_baseline_range
  CHECK (
    baseline_score IS NULL
    OR refined_score IS NULL
    OR refined_score BETWEEN baseline_score - 15 AND baseline_score + 15
  );

-- 1d. Composite read index
CREATE INDEX IF NOT EXISTS brief_snapshots_user_date_scores_idx
  ON public.brief_snapshots (user_id, local_date DESC, time_window, refined_score, baseline_score);

-- 1e. Rewrite user-update guard to cover renamed + new columns
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
     OR NEW.brief_source IS DISTINCT FROM OLD.brief_source
     OR NEW.driver IS DISTINCT FROM OLD.driver
     OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
     OR NEW.wearable_snapshot IS DISTINCT FROM OLD.wearable_snapshot
     OR NEW.checkin_snapshot IS DISTINCT FROM OLD.checkin_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.daily_checkin_id IS DISTINCT FROM OLD.daily_checkin_id
     OR NEW.pillar_mode IS DISTINCT FROM OLD.pillar_mode
     -- refined_*
     OR NEW.refined_score IS DISTINCT FROM OLD.refined_score
     OR NEW.refined_tier IS DISTINCT FROM OLD.refined_tier
     OR NEW.refined_phrase IS DISTINCT FROM OLD.refined_phrase
     OR NEW.refined_body_text IS DISTINCT FROM OLD.refined_body_text
     OR NEW.refined_lean_on IS DISTINCT FROM OLD.refined_lean_on
     OR NEW.refined_lean_on_source IS DISTINCT FROM OLD.refined_lean_on_source
     OR NEW.refined_watch_for IS DISTINCT FROM OLD.refined_watch_for
     OR NEW.refined_watch_for_source IS DISTINCT FROM OLD.refined_watch_for_source
     OR NEW.refined_signal_pills IS DISTINCT FROM OLD.refined_signal_pills
     OR NEW.refined_state IS DISTINCT FROM OLD.refined_state
     -- baseline_*
     OR NEW.baseline_score IS DISTINCT FROM OLD.baseline_score
     OR NEW.baseline_tier IS DISTINCT FROM OLD.baseline_tier
     OR NEW.baseline_phrase IS DISTINCT FROM OLD.baseline_phrase
     OR NEW.baseline_body_text IS DISTINCT FROM OLD.baseline_body_text
     OR NEW.baseline_lean_on IS DISTINCT FROM OLD.baseline_lean_on
     OR NEW.baseline_lean_on_source IS DISTINCT FROM OLD.baseline_lean_on_source
     OR NEW.baseline_watch_for IS DISTINCT FROM OLD.baseline_watch_for
     OR NEW.baseline_watch_for_source IS DISTINCT FROM OLD.baseline_watch_for_source
     OR NEW.baseline_signal_pills IS DISTINCT FROM OLD.baseline_signal_pills
     OR NEW.baseline_state IS DISTINCT FROM OLD.baseline_state
  THEN
    RAISE EXCEPTION 'Only user_rating and feedback_text may be updated by users';
  END IF;

  RETURN NEW;
END;
$function$;