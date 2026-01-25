-- Add RLS policies for DEV_MODE user on dialogue_sessions
CREATE POLICY "Dev user can view sessions"
ON public.dialogue_sessions FOR SELECT
USING (user_id = 'dev-user-123');

CREATE POLICY "Dev user can insert sessions"
ON public.dialogue_sessions FOR INSERT
WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "Dev user can update sessions"
ON public.dialogue_sessions FOR UPDATE
USING (user_id = 'dev-user-123');

-- Add RLS policies for DEV_MODE user on dialogue_messages
CREATE POLICY "Dev user can view messages"
ON public.dialogue_messages FOR SELECT
USING (session_id IN (SELECT id FROM dialogue_sessions WHERE user_id = 'dev-user-123'));

CREATE POLICY "Dev user can insert messages"
ON public.dialogue_messages FOR INSERT
WITH CHECK (session_id IN (SELECT id FROM dialogue_sessions WHERE user_id = 'dev-user-123'));

-- Add RLS policies for DEV_MODE user on daily_ritual_completions
CREATE POLICY "Dev user can view rituals"
ON public.daily_ritual_completions FOR SELECT
USING (user_id = 'dev-user-123');

CREATE POLICY "Dev user can insert rituals"
ON public.daily_ritual_completions FOR INSERT
WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "Dev user can update rituals"
ON public.daily_ritual_completions FOR UPDATE
USING (user_id = 'dev-user-123');