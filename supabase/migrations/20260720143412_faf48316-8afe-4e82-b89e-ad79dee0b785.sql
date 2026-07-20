
ALTER TABLE public.profiles DISABLE TRIGGER USER;

UPDATE public.profiles
SET subscription_canceled_at = NULL,
    subscription_cancel_at = NULL
WHERE id = 'linkedin|DFUJTWpo4O';

ALTER TABLE public.profiles ENABLE TRIGGER USER;

INSERT INTO public.subscription_events (user_id, event_type, to_tier, stripe_event_id, stripe_event_type, metadata)
SELECT
  'linkedin|DFUJTWpo4O',
  'manual_correction',
  'annual_pro',
  'manual_correction:linkedin|DFUJTWpo4O:2026-07-20',
  'manual_correction',
  jsonb_build_object(
    'reason', 'Stale customer.subscription.deleted webhook stamped canceled_at while a newer trialing subscription is active',
    'stripe_subscription_id', 'sub_1TvIBiLQjc3rT6fzhQNeBEzk',
    'cleared_fields', jsonb_build_array('subscription_canceled_at','subscription_cancel_at')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_events
  WHERE stripe_event_id = 'manual_correction:linkedin|DFUJTWpo4O:2026-07-20'
);
