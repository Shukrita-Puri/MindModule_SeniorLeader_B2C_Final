-- Add service role policies for daily_ritual_completions and daily_checkins

-- daily_ritual_completions: Add service role policy
CREATE POLICY "Service role can manage all daily ritual completions"
ON public.daily_ritual_completions
FOR ALL
USING (auth.role() = 'service_role'::text);

-- daily_checkins: Add service role policy (already exists but adding for completeness)
-- Check if policy exists first to avoid error
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_checkins' 
    AND policyname = 'Service role can manage all daily checkins'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage all daily checkins" ON public.daily_checkins FOR ALL USING (auth.role() = ''service_role''::text)';
  END IF;
END $$;