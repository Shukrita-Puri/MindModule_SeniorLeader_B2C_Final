CREATE TABLE IF NOT EXISTS public.churn_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.churn_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own churn feedback"
  ON public.churn_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own churn feedback"
  ON public.churn_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
