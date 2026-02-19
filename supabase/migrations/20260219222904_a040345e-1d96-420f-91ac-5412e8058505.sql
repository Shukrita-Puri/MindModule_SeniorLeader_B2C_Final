
-- =============================================
-- 1. Create inner_readiness_scores table
-- Stores the 3-layer AI insight statements and composite score
-- =============================================
CREATE TABLE public.inner_readiness_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  score_date DATE NOT NULL,
  composite_score INTEGER NOT NULL,
  energy_tier TEXT NOT NULL DEFAULT 'managing',
  time_of_day TEXT,
  check_in_outcome TEXT,
  clarity_level INTEGER,
  confidence_level INTEGER,
  -- 3-layer context statement components
  base_statement TEXT,
  modifier_statement TEXT,
  divergence_overlay TEXT,
  full_context_statement TEXT,
  -- Divergence analysis
  divergence_flag TEXT DEFAULT 'ALIGNED',
  hrv_deviation NUMERIC,
  -- Layers active
  layers_active TEXT[] DEFAULT '{base}',
  -- Data sources used
  data_sources TEXT[] DEFAULT '{}',
  confidence TEXT DEFAULT 'low',
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one score per user per date
CREATE UNIQUE INDEX idx_inner_readiness_scores_user_date ON public.inner_readiness_scores (user_id, score_date);
CREATE INDEX idx_inner_readiness_scores_date ON public.inner_readiness_scores (score_date);

ALTER TABLE public.inner_readiness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all inner readiness scores"
  ON public.inner_readiness_scores FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view their own inner readiness scores"
  ON public.inner_readiness_scores FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own inner readiness scores"
  ON public.inner_readiness_scores FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own inner readiness scores"
  ON public.inner_readiness_scores FOR UPDATE
  USING ((auth.uid())::text = user_id);

-- =============================================
-- 2. Create wearable_data table (Apple HealthKit)
-- =============================================
CREATE TABLE public.wearable_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'apple-healthkit',
  -- Core HRV metrics
  hrv NUMERIC,
  hrv_samples JSONB DEFAULT '[]',
  -- Heart rate
  resting_heart_rate INTEGER,
  -- Sleep
  sleep_score INTEGER,
  total_sleep_minutes INTEGER,
  deep_sleep_minutes INTEGER,
  rem_sleep_minutes INTEGER,
  -- Activity
  steps INTEGER,
  active_calories INTEGER,
  -- Derived states (computed client-side or via edge function)
  sleep_quality TEXT,
  energy_level TEXT,
  hrv_status TEXT,
  recovery_status TEXT,
  -- Raw data from HealthKit
  raw_data JSONB DEFAULT '{}',
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_wearable_data_user_date ON public.wearable_data (user_id, summary_date);
CREATE INDEX idx_wearable_data_date ON public.wearable_data (summary_date);

ALTER TABLE public.wearable_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all wearable data"
  ON public.wearable_data FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view their own wearable data"
  ON public.wearable_data FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own wearable data"
  ON public.wearable_data FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own wearable data"
  ON public.wearable_data FOR UPDATE
  USING ((auth.uid())::text = user_id);

-- =============================================
-- 3. Drop Oura tables (no data present)
-- =============================================
DROP TABLE IF EXISTS public.oura_daily_data CASCADE;
DROP TABLE IF EXISTS public.oura_connections CASCADE;

-- =============================================
-- 4. Trigger for updated_at on new tables
-- =============================================
CREATE TRIGGER update_inner_readiness_scores_updated_at
  BEFORE UPDATE ON public.inner_readiness_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wearable_data_updated_at
  BEFORE UPDATE ON public.wearable_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
