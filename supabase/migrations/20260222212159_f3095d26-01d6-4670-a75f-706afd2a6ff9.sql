-- Add indexes for fast insight_type + is_active queries on user_coach_insights
CREATE INDEX IF NOT EXISTS idx_coach_insights_user_type_active 
  ON public.user_coach_insights(user_id, insight_type, is_active);

CREATE INDEX IF NOT EXISTS idx_coach_insights_type 
  ON public.user_coach_insights(insight_type);

CREATE INDEX IF NOT EXISTS idx_coach_insights_active 
  ON public.user_coach_insights(is_active);