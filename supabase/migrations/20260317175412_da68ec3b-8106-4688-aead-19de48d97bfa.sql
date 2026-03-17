-- Clean up orphaned active coach sessions that have messages but were never ended
UPDATE public.dialogue_sessions
SET session_status = 'completed',
    ended_at = COALESCE(
      (SELECT MAX(timestamp) FROM public.dialogue_messages WHERE session_id = dialogue_sessions.id),
      now()
    )
WHERE session_status = 'active'
  AND context_type = 'coach'
  AND id IN (
    SELECT DISTINCT session_id FROM public.dialogue_messages
  );