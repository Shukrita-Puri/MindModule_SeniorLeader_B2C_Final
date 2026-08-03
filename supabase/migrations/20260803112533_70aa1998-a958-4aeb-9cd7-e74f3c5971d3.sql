-- Backfill profiles.country from the user's onboarding response.
-- profiles.id and onboarding_v8_responses.user_id are both text.
UPDATE public.profiles p
SET country = o.home_country
FROM (
  SELECT DISTINCT ON (user_id) user_id, home_country
  FROM public.onboarding_v8_responses
  WHERE home_country IS NOT NULL AND home_country <> ''
  ORDER BY user_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
) o
WHERE p.id = o.user_id
  AND (p.country IS NULL OR p.country = '');

-- Add current_country to travel_state
ALTER TABLE public.travel_state
  ADD COLUMN IF NOT EXISTS current_country text;

-- Add relocation detection columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS possible_relocation_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS relocation_candidate_tz text,
  ADD COLUMN IF NOT EXISTS relocation_first_detected_at timestamptz;