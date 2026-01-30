-- DEV_MODE RLS policy for tiny_wins
CREATE POLICY "DEV_MODE: dev-user-123 can select tiny_wins"
  ON public.tiny_wins
  FOR SELECT
  USING (user_id = 'dev-user-123');

-- DEV_MODE RLS policies for profiles
CREATE POLICY "DEV_MODE: dev-user-123 can select profile"
  ON public.profiles
  FOR SELECT
  USING (id = 'dev-user-123');

CREATE POLICY "DEV_MODE: dev-user-123 can insert profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = 'dev-user-123');

CREATE POLICY "DEV_MODE: dev-user-123 can update profile"
  ON public.profiles
  FOR UPDATE
  USING (id = 'dev-user-123')
  WITH CHECK (id = 'dev-user-123');

-- Create baseline profile for dev-user-123
INSERT INTO public.profiles (id, email, full_name, mental_fitness_baseline, user_archetype, growth_priority, onboarding_completed_at)
VALUES (
  'dev-user-123',
  'dev@example.com',
  'Dev User',
  72,
  'adaptive-navigator',
  'mental-clarity',
  NOW()
) ON CONFLICT (id) DO NOTHING;