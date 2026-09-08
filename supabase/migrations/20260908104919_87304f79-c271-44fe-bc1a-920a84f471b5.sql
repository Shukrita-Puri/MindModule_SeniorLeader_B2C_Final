ALTER TABLE public.onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS cos_profile_quality text;

UPDATE public.onboarding_v8_responses
SET cos_profile_status = 'ready',
    cos_profile_quality = COALESCE(cos_profile_quality, 'thin')
WHERE cos_profile_status = 'needs_input'
  AND cos_profile IS NOT NULL;

UPDATE public.onboarding_v8_responses
SET cos_profile_quality = 'partial'
WHERE cos_profile_quality IS NULL
  AND cos_profile IS NOT NULL
  AND cos_profile_status = 'ready';