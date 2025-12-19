-- Phase 4: Lock down dialogue tables (Auth0-safe)
-- Drop all permissive RLS policies that use USING true or auth.uid()

-- dialogue_sessions
DROP POLICY IF EXISTS "Authenticated users can insert dialogue sessions" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Users can view dialogue sessions" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Users can update dialogue sessions" ON public.dialogue_sessions;

-- dialogue_messages
DROP POLICY IF EXISTS "Authenticated users can insert dialogue messages" ON public.dialogue_messages;
DROP POLICY IF EXISTS "Users can view dialogue messages" ON public.dialogue_messages;

-- dialogue_skill_events
DROP POLICY IF EXISTS "Authenticated users can insert dialogue skill events" ON public.dialogue_skill_events;
DROP POLICY IF EXISTS "Users can view dialogue skill events" ON public.dialogue_skill_events;

-- Ensure RLS is enabled and forced on all dialogue tables
ALTER TABLE public.dialogue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_skill_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_signals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dialogue_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_skill_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_interventions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.detected_signals FORCE ROW LEVEL SECURITY;