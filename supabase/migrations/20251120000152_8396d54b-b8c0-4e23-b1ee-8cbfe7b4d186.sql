-- Step 1: Drop the materialized view that depends on user_id
DROP MATERIALIZED VIEW IF EXISTS public.content_usage_analytics;

-- Step 2: Drop ALL foreign key constraints on user_id columns
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND (kcu.column_name = 'user_id' OR kcu.column_name = 'id')
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', 
            r.table_name, r.constraint_name);
    END LOOP;
END $$;

-- Step 3: Drop all RLS policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
            r.policyname, r.tablename);
    END LOOP;
END $$;

-- Step 4: Change all user_id and id columns from UUID to TEXT
ALTER TABLE public.profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.calendar_connections ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.calendar_events ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.checkin_skip_events ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.content_relevance_feedback ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.daily_checkins ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.daily_ritual_completions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.energy_snapshots ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.mental_fitness_scores ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.micro_intervention_events ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.oura_connections ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.oura_daily_data ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.practice_sessions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.sanctuary_events ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.user_engagements ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.user_favorites ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.user_preferences ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE text USING user_id::text;

-- Step 5: Recreate all RLS policies with auth.uid()::text
CREATE POLICY "Users can only insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid()::text = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid()::text = id);
CREATE POLICY "Users can view own full profile" ON public.profiles
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Users can delete their own calendar connections" ON public.calendar_connections
  FOR DELETE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert their own calendar connections" ON public.calendar_connections
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own calendar connections" ON public.calendar_connections
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own calendar connections" ON public.calendar_connections
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can manage their own calendar events" ON public.calendar_events
  FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own calendar events" ON public.calendar_events
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own skip events" ON public.checkin_skip_events
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view own skip events" ON public.checkin_skip_events
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own feedback" ON public.content_relevance_feedback
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own feedback" ON public.content_relevance_feedback
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own checkins" ON public.daily_checkins
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own checkins" ON public.daily_checkins
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own ritual completions" ON public.daily_ritual_completions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own ritual completions" ON public.daily_ritual_completions
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own ritual completions" ON public.daily_ritual_completions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own snapshots" ON public.energy_snapshots
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own snapshots" ON public.energy_snapshots
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own snapshots" ON public.energy_snapshots
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own fitness scores" ON public.mental_fitness_scores
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own fitness scores" ON public.mental_fitness_scores
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own fitness scores" ON public.mental_fitness_scores
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own intervention events" ON public.micro_intervention_events
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own intervention events" ON public.micro_intervention_events
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own oura connections" ON public.oura_connections
  FOR DELETE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert their own oura connections" ON public.oura_connections
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own oura connections" ON public.oura_connections
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own oura connections" ON public.oura_connections
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can manage their own oura data" ON public.oura_daily_data
  FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own oura data" ON public.oura_daily_data
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own practice sessions" ON public.practice_sessions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own practice sessions" ON public.practice_sessions
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own practice sessions" ON public.practice_sessions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own events" ON public.sanctuary_events
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own events" ON public.sanctuary_events
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own engagements" ON public.user_engagements
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own engagements" ON public.user_engagements
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own favorites" ON public.user_favorites
  FOR DELETE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert their own favorites" ON public.user_favorites
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own favorites" ON public.user_favorites
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view their own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Only admins can assign roles" ON public.user_roles
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can delete roles" ON public.user_roles
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can view roles" ON public.user_roles
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Roles cannot be updated" ON public.user_roles
  FOR UPDATE USING (false);