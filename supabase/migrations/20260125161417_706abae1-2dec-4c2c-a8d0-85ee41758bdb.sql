-- Add RLS policy for dev-user-123 to sanctuary_events for development mode
CREATE POLICY "Dev user can insert events"
ON public.sanctuary_events
FOR INSERT
WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "Dev user can view events"
ON public.sanctuary_events
FOR SELECT
USING (user_id = 'dev-user-123');