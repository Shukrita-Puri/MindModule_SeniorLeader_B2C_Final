-- Brief snapshots: canonical cache for Performance Readiness briefs
CREATE TABLE public.brief_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  local_date date NOT NULL,
  time_window text NOT NULL CHECK (time_window IN ('morning','afternoon','evening')),
  input_signature text NOT NULL,
  prompt_version text NOT NULL,
  phrase text,
  body_text text,
  lean_on text,
  lean_on_source text,
  watch_for text,
  watch_for_source text,
  brief_source text NOT NULL CHECK (brief_source IN ('llm','deterministic')),
  driver text,
  score integer,
  tier text,
  payload_json jsonb,
  user_rating text CHECK (user_rating IN ('up','neutral','down')),
  feedback_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX brief_snapshots_canonical_idx
  ON public.brief_snapshots (user_id, local_date, time_window, input_signature, prompt_version);

CREATE INDEX brief_snapshots_user_date_idx
  ON public.brief_snapshots (user_id, local_date DESC);

ALTER TABLE public.brief_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own briefs (project uses Auth0 JWT with sub claim)
CREATE POLICY "Users can read own brief snapshots"
  ON public.brief_snapshots
  FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'));

-- Users can update only rating/feedback on their own briefs.
-- Use a trigger (below) to enforce that only user_rating and feedback_text change.
CREATE POLICY "Users can update rating on own brief snapshots"
  ON public.brief_snapshots
  FOR UPDATE
  USING (user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

-- Service role full access (writes from edge function)
CREATE POLICY "Service role full access to brief_snapshots"
  ON public.brief_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger: keep updated_at fresh
CREATE TRIGGER brief_snapshots_set_updated_at
  BEFORE UPDATE ON public.brief_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when a non-service-role user updates, only allow user_rating + feedback_text + updated_at to change.
CREATE OR REPLACE FUNCTION public.brief_snapshots_user_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only user_rating and feedback_text may be updated by users';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER brief_snapshots_user_update_guard_trg
  BEFORE UPDATE ON public.brief_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.brief_snapshots_user_update_guard();