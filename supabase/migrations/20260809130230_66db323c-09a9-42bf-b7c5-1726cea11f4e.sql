-- 1. Confirmed classifications (per user, per normalised title)
CREATE TABLE public.event_category_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title_norm text NOT NULL,
  event_category char(1),
  event_subcategory text,
  subtype_id text,
  source text NOT NULL DEFAULT 'resolver',
  resolved_by text,
  confidence text NOT NULL DEFAULT 'medium',
  observation_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, title_norm)
);

GRANT SELECT ON public.event_category_confirmations TO authenticated;
GRANT ALL ON public.event_category_confirmations TO service_role;
ALTER TABLE public.event_category_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own confirmations"
ON public.event_category_confirmations FOR SELECT TO authenticated
USING (user_id = (auth.jwt() ->> 'sub'));

CREATE INDEX idx_event_cat_conf_user ON public.event_category_confirmations (user_id, title_norm);

CREATE TRIGGER event_category_confirmations_set_updated_at
BEFORE UPDATE ON public.event_category_confirmations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Learned token cues (per user, promoted by nightly roll-up)
CREATE TABLE public.event_learned_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  token text NOT NULL,
  event_category char(1) NOT NULL,
  event_subcategory text,
  subtype_id text,
  distinct_title_count integer NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'medium',
  source text NOT NULL DEFAULT 'token_generalisation',
  promoted_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

GRANT SELECT ON public.event_learned_tokens TO authenticated;
GRANT ALL ON public.event_learned_tokens TO service_role;
ALTER TABLE public.event_learned_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own learned tokens"
ON public.event_learned_tokens FOR SELECT TO authenticated
USING (user_id = (auth.jwt() ->> 'sub'));

CREATE INDEX idx_event_learned_tokens_user ON public.event_learned_tokens (user_id) WHERE retired_at IS NULL;

CREATE TRIGGER event_learned_tokens_set_updated_at
BEFORE UPDATE ON public.event_learned_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Stamp provenance on calendar_events (additive, nullable)
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS category_resolved_by text,
  ADD COLUMN IF NOT EXISTS category_confidence text,
  ADD COLUMN IF NOT EXISTS category_resolved_at timestamptz;

-- 4. Nightly token generalisation roll-up
CREATE OR REPLACE FUNCTION public.promote_learned_event_tokens(p_min_titles integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promoted integer := 0;
  v_retired  integer := 0;
BEGIN
  WITH tokens AS (
    SELECT
      c.user_id,
      c.event_category,
      c.event_subcategory,
      lower(tok) AS token,
      c.title_norm
    FROM public.event_category_confirmations c
    CROSS JOIN LATERAL regexp_split_to_table(c.title_norm, '[^a-z0-9]+') AS tok
    WHERE c.event_category IS NOT NULL
      AND length(tok) >= 4
      AND tok !~ '^[0-9]+$'
      AND tok NOT IN (
        'with','meeting','call','review','team','weekly','monthly','session',
        'sync','update','catch','chat','from','into','your','this','that',
        'time','block','discussion','check','follow','plan','planning'
      )
  ),
  agg AS (
    SELECT user_id, token, event_category,
           max(event_subcategory) AS event_subcategory,
           count(DISTINCT title_norm) AS distinct_titles
    FROM tokens
    GROUP BY user_id, token, event_category
  ),
  -- Only promote when the token maps to exactly one category for that user
  unambiguous AS (
    SELECT a.*
    FROM agg a
    WHERE a.distinct_titles >= p_min_titles
      AND NOT EXISTS (
        SELECT 1 FROM agg b
        WHERE b.user_id = a.user_id AND b.token = a.token
          AND b.event_category <> a.event_category
      )
  ),
  ins AS (
    INSERT INTO public.event_learned_tokens
      (user_id, token, event_category, event_subcategory, distinct_title_count, confidence, promoted_at, retired_at)
    SELECT user_id, token, event_category, event_subcategory, distinct_titles, 'medium', now(), NULL
    FROM unambiguous
    ON CONFLICT (user_id, token) DO UPDATE SET
      event_category = EXCLUDED.event_category,
      event_subcategory = EXCLUDED.event_subcategory,
      distinct_title_count = EXCLUDED.distinct_title_count,
      retired_at = NULL,
      promoted_at = now(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_promoted FROM ins;

  -- Retire tokens that no longer meet the threshold or became ambiguous
  WITH still_valid AS (
    SELECT user_id, token FROM (
      SELECT c.user_id, lower(tok) AS token, c.event_category,
             count(DISTINCT c.title_norm) AS distinct_titles
      FROM public.event_category_confirmations c
      CROSS JOIN LATERAL regexp_split_to_table(c.title_norm, '[^a-z0-9]+') AS tok
      WHERE c.event_category IS NOT NULL AND length(tok) >= 4
      GROUP BY c.user_id, lower(tok), c.event_category
    ) s
    WHERE s.distinct_titles >= p_min_titles
  ),
  ret AS (
    UPDATE public.event_learned_tokens t
    SET retired_at = now(), updated_at = now()
    WHERE t.retired_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM still_valid v WHERE v.user_id = t.user_id AND v.token = t.token
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_retired FROM ret;

  RETURN jsonb_build_object('promoted', v_promoted, 'retired', v_retired, 'ran_at', now());
END;
$$;