CREATE TABLE public.practice_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  practice_id text NOT NULL,
  practice_type text NOT NULL DEFAULT 'mindset',
  session_id uuid NULL,
  temp_session_key text NULL,
  step_number integer NOT NULL,
  step_title text,
  prompt text,
  response text NOT NULL,
  entry_context text,
  local_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique upsert key: per user/practice/session(or temp key)/step
CREATE UNIQUE INDEX practice_reflections_upsert_key
  ON public.practice_reflections (
    user_id,
    practice_id,
    COALESCE(session_id::text, COALESCE(temp_session_key, '__none__')),
    step_number
  );

CREATE INDEX practice_reflections_user_practice_date
  ON public.practice_reflections (user_id, practice_id, local_date DESC);

CREATE INDEX practice_reflections_user_session
  ON public.practice_reflections (user_id, session_id);

ALTER TABLE public.practice_reflections ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies created. Only service_role bypasses RLS.

CREATE TRIGGER update_practice_reflections_updated_at
  BEFORE UPDATE ON public.practice_reflections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();