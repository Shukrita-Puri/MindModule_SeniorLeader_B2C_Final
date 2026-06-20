CREATE TABLE IF NOT EXISTS public.event_priority_derived (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_category text NOT NULL,
  event_type_key text NOT NULL,
  net_importance numeric NOT NULL DEFAULT 0,
  relationship_role text,
  confidence numeric,
  signal_count integer NOT NULL DEFAULT 0,
  last_reinforced_at timestamptz,
  permanent_flag boolean NOT NULL DEFAULT false,
  last_signal text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_category, event_type_key)
);

CREATE INDEX IF NOT EXISTS idx_event_priority_derived_user
  ON public.event_priority_derived (user_id);

ALTER TABLE public.event_priority_derived ENABLE ROW LEVEL SECURITY;

-- Service-role only today. User-facing reads can be added when the derived
-- memory UX ships.
