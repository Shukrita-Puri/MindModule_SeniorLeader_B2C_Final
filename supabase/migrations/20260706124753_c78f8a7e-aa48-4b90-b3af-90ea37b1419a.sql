UPDATE public.daily_context_snapshot
SET inner_score = NULL,
    readiness_state = 'awaiting',
    tier_displayed = NULL,
    inner_tier = NULL
WHERE (weight_provenance->>'awaiting_signals')::boolean IS TRUE
  AND inner_score IS NOT NULL;