-- Add RLS policy for dev-user-123 to practice_sessions for development mode
CREATE POLICY "Dev user can insert practice sessions"
ON public.practice_sessions
FOR INSERT
WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "Dev user can view practice sessions"
ON public.practice_sessions
FOR SELECT
USING (user_id = 'dev-user-123');