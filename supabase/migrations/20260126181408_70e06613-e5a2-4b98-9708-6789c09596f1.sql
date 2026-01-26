-- Add DEV_MODE policy for daily_checkins to allow dev-user-123 to insert and select
CREATE POLICY "DEV_MODE: dev-user-123 can insert checkins"
  ON public.daily_checkins
  FOR INSERT
  WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "DEV_MODE: dev-user-123 can select checkins"
  ON public.daily_checkins
  FOR SELECT
  USING (user_id = 'dev-user-123');

CREATE POLICY "DEV_MODE: dev-user-123 can update checkins"
  ON public.daily_checkins
  FOR UPDATE
  USING (user_id = 'dev-user-123')
  WITH CHECK (user_id = 'dev-user-123');