CREATE TABLE public.connection_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  issue text NOT NULL CHECK (issue IN ('wearable','calendar','push')),
  attempts integer NOT NULL DEFAULT 0,
  requested_by text,
  last_requested_at timestamptz,
  first_prompt_shown_at timestamptz,
  last_prompt_shown_at timestamptz,
  prompt_dismiss_count integer NOT NULL DEFAULT 0,
  push_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, issue)
);

GRANT ALL ON public.connection_recovery_requests TO service_role;

ALTER TABLE public.connection_recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages connection recovery requests"
ON public.connection_recovery_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_connection_recovery_unresolved
  ON public.connection_recovery_requests (user_id, issue)
  WHERE resolved_at IS NULL;

CREATE TRIGGER update_connection_recovery_requests_updated_at
BEFORE UPDATE ON public.connection_recovery_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();