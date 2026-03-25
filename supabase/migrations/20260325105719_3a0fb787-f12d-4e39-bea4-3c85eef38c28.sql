
-- Phase 1: JIT Six-Stage Pipeline — New tables + columns

-- 1. jit_cancellation_memory table
CREATE TABLE public.jit_cancellation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_type text,
  cluster text,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  penalty_level integer NOT NULL DEFAULT 25
);

ALTER TABLE public.jit_cancellation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage jit_cancellation_memory"
  ON public.jit_cancellation_memory FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_jit_cancellation_memory_user ON public.jit_cancellation_memory(user_id);

-- 2. readiness_baselines table
CREATE TABLE public.readiness_baselines (
  user_id text PRIMARY KEY,
  baseline_hrv numeric,
  baseline_rhr numeric,
  baseline_established_at timestamptz,
  wearable_connected_at timestamptz,
  rolling_hrv_30d jsonb DEFAULT '[]'::jsonb,
  rolling_rhr_3d jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.readiness_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage readiness_baselines"
  ON public.readiness_baselines FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view own readiness_baselines"
  ON public.readiness_baselines FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'::text));

-- 3. Add new columns to jit_event_context
ALTER TABLE public.jit_event_context
  ADD COLUMN IF NOT EXISTS jit_bucket_primary text,
  ADD COLUMN IF NOT EXISTS jit_bucket_secondary text,
  ADD COLUMN IF NOT EXISTS jit_confidence_score integer,
  ADD COLUMN IF NOT EXISTS jit_dimension_scores jsonb,
  ADD COLUMN IF NOT EXISTS jit_urgency_horizon text,
  ADD COLUMN IF NOT EXISTS jit_horizons_surfaced text[] DEFAULT '{}';
