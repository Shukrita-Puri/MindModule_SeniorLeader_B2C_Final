-- 20260620100000_event_priority_derived
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

GRANT ALL ON public.event_priority_derived TO service_role;

ALTER TABLE public.event_priority_derived ENABLE ROW LEVEL SECURITY;

-- 20260620101000_attendee_relationship_roles
ALTER TABLE public.attendee_relationships
  DROP CONSTRAINT IF EXISTS attendee_relationships_role_check;

ALTER TABLE public.attendee_relationships
  ADD CONSTRAINT attendee_relationships_role_check
  CHECK (role = ANY (ARRAY[
    'board_member','direct_boss','investor','regulator','acquirer_target',
    'skip_level','journalist_media','customer','client','external_partner',
    'report_direct','peer','vendor','report_junior','unknown'
  ]));