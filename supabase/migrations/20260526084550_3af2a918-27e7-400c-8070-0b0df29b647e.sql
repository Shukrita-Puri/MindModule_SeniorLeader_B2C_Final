
CREATE TABLE IF NOT EXISTS public.jit_shadow_v2_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  tier text NOT NULL,
  account_age_days integer NOT NULL,
  pattern_count integer NOT NULL,
  ranked_count integer NOT NULL,
  excluded_count integer NOT NULL,
  top_event_id text,
  top_event_title text,
  top_event_role text,
  top_importance numeric,
  top_components jsonb,
  legacy_top_event_id text,
  legacy_top_event_title text,
  legacy_top_score integer,
  parity_match boolean,
  ranked jsonb,
  excluded jsonb
);

CREATE INDEX IF NOT EXISTS idx_jit_shadow_v2_user_runat
  ON public.jit_shadow_v2_runs (user_id, run_at DESC);

ALTER TABLE public.jit_shadow_v2_runs ENABLE ROW LEVEL SECURITY;
-- Deny-by-default. Service role only.
