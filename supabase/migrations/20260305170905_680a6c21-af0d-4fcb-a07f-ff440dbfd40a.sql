ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_insight text,
  ADD COLUMN IF NOT EXISTS archetype_description text,
  ADD COLUMN IF NOT EXISTS archetype_title text;