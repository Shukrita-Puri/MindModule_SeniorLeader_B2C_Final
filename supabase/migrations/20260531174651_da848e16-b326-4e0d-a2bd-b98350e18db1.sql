-- MRS v2: add strategic context placeholder columns + daily_context_snapshot SSOT table

-- 1. Profiles placeholder columns (populated by future onboarding step)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pressure_profile JSONB,
  ADD COLUMN IF NOT EXISTS protection_goals JSONB;

COMMENT ON COLUMN public.profiles.pressure_profile IS
  'MRS v2 strategic context. JSONB array of selected pressure chip IDs from onboarding (board, MA, travel, decision_overload, back_to_back, timezone_shifting, disrupted_recovery, etc.). NULL = no personalisation. Feeds LLM context only — does NOT change the numerical readiness score.';
COMMENT ON COLUMN public.profiles.protection_goals IS
  'MRS v2 strategic context. JSONB array of selected protection goal IDs from onboarding (regulate_under_pressure, prepare_before_high_stakes, recover_capacity, protect_decision_quality, navigate_difficult_people). NULL = no personalisation. Feeds Plan protocol selection and brief LLM framing — does NOT affect composite score.';

-- 2. Daily context snapshot — single source of truth for Brief / Nudges / Plan
CREATE TABLE IF NOT EXISTS public.daily_context_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  local_date DATE NOT NULL,

  -- Pattern signals (pattern-engine.ts output)
  pattern_signals JSONB,

  -- Strategic context (strategic-context.ts output, resolved from profiles)
  strategic_context JSONB,

  -- Calendar demand (demand-scorer.ts output)
  calendar_demand_score INT,
  demand_load TEXT,        -- 'low' | 'medium' | 'high'
  demand_pressure TEXT,    -- 'low' | 'medium' | 'high'
  has_high_stakes BOOLEAN DEFAULT FALSE,

  -- Inner readiness output
  inner_score INT,
  inner_tier TEXT,         -- 'depleted' | 'managing' | 'strong' | 'peak'
  pillar_mode TEXT,
  weighting_mode TEXT,     -- 'no_wearable' | 'wearable_early' | 'aligned' | 'supply_demand_gap' | 'recovery_window'
  supply_demand_gap_flag TEXT, -- 'ALIGNED' | 'SUPPLY_DEMAND_GAP' | 'RECOVERY_UNDERWAY' | 'LIGHT_DAY_STRONG_STATE'

  -- Canonical 3-pill payload (mirror of brief_snapshots.signal_pills during transition)
  signal_pills JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_context_snapshot_user_date
  ON public.daily_context_snapshot (user_id, local_date DESC);

-- 3. GRANTs — writes are service-role only; clients read their own row
GRANT SELECT ON public.daily_context_snapshot TO authenticated;
GRANT ALL ON public.daily_context_snapshot TO service_role;

-- 4. RLS — deny-by-default; Auth0 sub match (same pattern as brief_snapshots)
ALTER TABLE public.daily_context_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own context snapshot"
  ON public.daily_context_snapshot
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- updated_at trigger reusing existing helper
CREATE TRIGGER update_daily_context_snapshot_updated_at
  BEFORE UPDATE ON public.daily_context_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.daily_context_snapshot IS
  'MRS v2 single source of truth for the daily readiness context. Written by signal-engine build-daily-context orchestrator (service-role only). Read by Brief, Smart Nudges, and Plan generators. Idempotent per (user_id, local_date).';