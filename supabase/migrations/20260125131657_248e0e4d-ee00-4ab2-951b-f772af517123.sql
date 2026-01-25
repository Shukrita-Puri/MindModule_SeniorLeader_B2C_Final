-- Add RLS policies for dev-user-123 on detected_signals table (for progress tracking)
CREATE POLICY "Dev user can read detected_signals"
ON public.detected_signals
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions WHERE user_id = 'dev-user-123'
  )
);

-- Ensure dev user can read dialogue_sessions with scenario info
CREATE POLICY "Dev user can read dialogue_sessions"
ON public.dialogue_sessions
FOR SELECT
USING (user_id = 'dev-user-123');