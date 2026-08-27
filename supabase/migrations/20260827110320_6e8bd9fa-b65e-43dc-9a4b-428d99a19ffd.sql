CREATE TABLE IF NOT EXISTS public.churn_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT ON public.churn_feedback TO authenticated;
GRANT ALL ON public.churn_feedback TO service_role;

ALTER TABLE public.churn_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own churn feedback" ON public.churn_feedback;
CREATE POLICY "Users can insert their own churn feedback"
  ON public.churn_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "Users can read their own churn feedback" ON public.churn_feedback;
CREATE POLICY "Users can read their own churn feedback"
  ON public.churn_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));