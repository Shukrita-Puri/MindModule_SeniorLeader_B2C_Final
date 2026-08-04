-- One-off backfill of profiles.user_archetype from the onboarding CoS profile.
-- The profiles table has a guard trigger that blocks privileged-field writes for
-- non-service_role callers; this migration disables it for the duration of the
-- single UPDATE and re-enables it immediately after.
ALTER TABLE public.profiles DISABLE TRIGGER profiles_block_privileged_updates_trg;

UPDATE public.profiles p
SET user_archetype = 'strategic-pauser'
FROM public.onboarding_v8_responses r
WHERE r.user_id = p.id
  AND r.cos_profile_status = 'ready'
  AND (p.user_archetype IS NULL OR p.user_archetype = '')
  AND lower(r.cos_profile->'provisional_archetype'->>'name') LIKE '%architect%';

ALTER TABLE public.profiles ENABLE TRIGGER profiles_block_privileged_updates_trg;