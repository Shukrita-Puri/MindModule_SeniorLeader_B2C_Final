-- Fix RLS policies for dialogue-related tables to enforce user data isolation
-- These tables were using permissive USING (true) policies due to Auth0 integration

-- =====================================================
-- Fix dialogue_sessions RLS policies
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated session insert" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Allow authenticated session select" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Allow authenticated session update" ON public.dialogue_sessions;

CREATE POLICY "Users can view their own dialogue sessions" 
ON public.dialogue_sessions 
FOR SELECT 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own dialogue sessions" 
ON public.dialogue_sessions 
FOR INSERT 
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own dialogue sessions" 
ON public.dialogue_sessions 
FOR UPDATE 
USING ((auth.uid())::text = user_id);

-- =====================================================
-- Fix dialogue_messages RLS policies (linked via session_id)
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated message insert" ON public.dialogue_messages;
DROP POLICY IF EXISTS "Allow authenticated message select" ON public.dialogue_messages;

CREATE POLICY "Users can view their own dialogue messages" 
ON public.dialogue_messages 
FOR SELECT 
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can insert their own dialogue messages" 
ON public.dialogue_messages 
FOR INSERT 
WITH CHECK (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

-- =====================================================
-- Fix detected_signals RLS policies (linked via session_id)
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated signal insert" ON public.detected_signals;
DROP POLICY IF EXISTS "Allow authenticated signal select" ON public.detected_signals;

CREATE POLICY "Users can view their own detected signals" 
ON public.detected_signals 
FOR SELECT 
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can insert their own detected signals" 
ON public.detected_signals 
FOR INSERT 
WITH CHECK (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

-- =====================================================
-- Fix dialogue_interventions RLS policies (linked via session_id)
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated intervention insert" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Allow authenticated intervention select" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Allow authenticated intervention update" ON public.dialogue_interventions;

CREATE POLICY "Users can view their own dialogue interventions" 
ON public.dialogue_interventions 
FOR SELECT 
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can insert their own dialogue interventions" 
ON public.dialogue_interventions 
FOR INSERT 
WITH CHECK (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can update their own dialogue interventions" 
ON public.dialogue_interventions 
FOR UPDATE 
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

-- =====================================================
-- Fix dialogue_skill_events RLS policies (linked via session_id)
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated skill event insert" ON public.dialogue_skill_events;
DROP POLICY IF EXISTS "Allow authenticated skill event select" ON public.dialogue_skill_events;

CREATE POLICY "Users can view their own dialogue skill events" 
ON public.dialogue_skill_events 
FOR SELECT 
USING (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can insert their own dialogue skill events" 
ON public.dialogue_skill_events 
FOR INSERT 
WITH CHECK (
  session_id IN (
    SELECT id FROM public.dialogue_sessions 
    WHERE user_id = (auth.uid())::text
  )
);

-- =====================================================
-- Fix daily_ritual_completions RLS policies
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated users to delete ritual completions" ON public.daily_ritual_completions;
DROP POLICY IF EXISTS "Allow authenticated users to insert ritual completions" ON public.daily_ritual_completions;
DROP POLICY IF EXISTS "Allow authenticated users to select ritual completions" ON public.daily_ritual_completions;
DROP POLICY IF EXISTS "Allow authenticated users to update ritual completions" ON public.daily_ritual_completions;

CREATE POLICY "Users can view their own ritual completions" 
ON public.daily_ritual_completions 
FOR SELECT 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own ritual completions" 
ON public.daily_ritual_completions 
FOR INSERT 
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own ritual completions" 
ON public.daily_ritual_completions 
FOR UPDATE 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete their own ritual completions" 
ON public.daily_ritual_completions 
FOR DELETE 
USING ((auth.uid())::text = user_id);

-- =====================================================
-- Fix session_feedback RLS policies
-- =====================================================
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.session_feedback;
DROP POLICY IF EXISTS "Users can read own feedback" ON public.session_feedback;

CREATE POLICY "Users can view their own session feedback" 
ON public.session_feedback 
FOR SELECT 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own session feedback" 
ON public.session_feedback 
FOR INSERT 
WITH CHECK ((auth.uid())::text = user_id);