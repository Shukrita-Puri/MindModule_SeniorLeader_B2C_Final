ALTER TABLE public.daily_context_snapshot
  ADD COLUMN IF NOT EXISTS readiness_score_baseline integer,
  ADD COLUMN IF NOT EXISTS readiness_score_refined integer,
  ADD COLUMN IF NOT EXISTS readiness_state text,
  ADD COLUMN IF NOT EXISTS refined_contribution integer;

COMMENT ON COLUMN public.daily_context_snapshot.readiness_score_baseline IS
  'MRS v3 State 1: raw baseline score (physio + demand, patterns as context only). Always written.';
COMMENT ON COLUMN public.daily_context_snapshot.readiness_score_refined IS
  'MRS v3 State 2: refined score blending baseline (70%) with 4 Mind Check-in dims (30%), hard-capped at baseline ±15. Null until check-in for the window.';
COMMENT ON COLUMN public.daily_context_snapshot.readiness_state IS
  'MRS v3: which state the displayed score reflects — baseline | refined.';
COMMENT ON COLUMN public.daily_context_snapshot.refined_contribution IS
  'MRS v3: signed delta refined - baseline, integer in [-15, +15]. 0 when state=baseline.';