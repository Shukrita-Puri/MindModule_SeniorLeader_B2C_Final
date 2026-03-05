-- Remove all DEV_MODE RLS policies that allow anonymous access as dev-user-123

-- daily_checkins
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can update checkins" ON public.daily_checkins;
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can select checkins" ON public.daily_checkins;
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can insert checkins" ON public.daily_checkins;

-- profiles
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can update profile" ON public.profiles;
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can insert profile" ON public.profiles;
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can select profile" ON public.profiles;

-- tiny_wins
DROP POLICY IF EXISTS "DEV_MODE: dev-user-123 can select tiny_wins" ON public.tiny_wins;

-- dialogue_sessions
DROP POLICY IF EXISTS "Dev user can view sessions" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Dev user can update sessions" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Dev user can read dialogue_sessions" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Dev user can insert sessions" ON public.dialogue_sessions;

-- dialogue_messages
DROP POLICY IF EXISTS "Dev user can view messages" ON public.dialogue_messages;
DROP POLICY IF EXISTS "Dev user can insert messages" ON public.dialogue_messages;

-- detected_signals
DROP POLICY IF EXISTS "Dev user can read detected_signals" ON public.detected_signals;

-- daily_ritual_completions
DROP POLICY IF EXISTS "Dev user can update rituals" ON public.daily_ritual_completions;
DROP POLICY IF EXISTS "Dev user can view rituals" ON public.daily_ritual_completions;
DROP POLICY IF EXISTS "Dev user can insert rituals" ON public.daily_ritual_completions;

-- user_favorites
DROP POLICY IF EXISTS "Dev user can view favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Dev user can delete favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Dev user can insert favorites" ON public.user_favorites;

-- practice_sessions
DROP POLICY IF EXISTS "Dev user can insert practice sessions" ON public.practice_sessions;
DROP POLICY IF EXISTS "Dev user can view practice sessions" ON public.practice_sessions;

-- coach_intervention_outcomes
DROP POLICY IF EXISTS "Dev user can manage intervention outcomes" ON public.coach_intervention_outcomes;

-- sanctuary_events
DROP POLICY IF EXISTS "Dev user can view events" ON public.sanctuary_events;
DROP POLICY IF EXISTS "Dev user can insert events" ON public.sanctuary_events;