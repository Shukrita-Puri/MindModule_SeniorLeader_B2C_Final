
CREATE TABLE public.coach_tools_offered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid REFERENCES public.dialogue_sessions(id),
  tool_name text NOT NULL,
  tool_type text DEFAULT 'practice',
  event_types text[] DEFAULT '{}',
  offered_at timestamptz DEFAULT now(),
  was_used boolean DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_tools_offered ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all coach_tools_offered"
  ON public.coach_tools_offered FOR ALL
  USING (auth.role() = 'service_role');
