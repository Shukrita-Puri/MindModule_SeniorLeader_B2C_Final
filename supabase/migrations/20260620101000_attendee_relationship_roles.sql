ALTER TABLE public.attendee_relationships
  DROP CONSTRAINT IF EXISTS attendee_relationships_role_check;

ALTER TABLE public.attendee_relationships
  ADD CONSTRAINT attendee_relationships_role_check
  CHECK (role = ANY (ARRAY[
    'board_member',
    'direct_boss',
    'investor',
    'regulator',
    'acquirer_target',
    'skip_level',
    'journalist_media',
    'customer',
    'client',
    'external_partner',
    'report_direct',
    'peer',
    'vendor',
    'report_junior',
    'unknown'
  ]));
