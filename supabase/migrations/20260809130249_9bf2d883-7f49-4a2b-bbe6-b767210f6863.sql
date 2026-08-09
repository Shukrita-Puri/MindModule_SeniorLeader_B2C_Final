REVOKE EXECUTE ON FUNCTION public.promote_learned_event_tokens(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_learned_event_tokens(integer) TO service_role;