ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IS NULL OR subscription_status = ANY (ARRAY['active','inactive','trial','trialing','past_due','canceled']));