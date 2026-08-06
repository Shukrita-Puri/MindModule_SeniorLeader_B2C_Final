-- Lock down SECURITY DEFINER helpers exposed through the Data API.
-- has_role(uuid, app_role) is unused by any policy or app code -> fully revoked.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- has_role(text, app_role) is referenced by admin RLS policies, which are
-- evaluated with the invoking role's privileges, so authenticated must retain
-- EXECUTE or every admin-gated table write fails. anon is revoked.
REVOKE ALL ON FUNCTION public.has_role(text, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(text, public.app_role) TO authenticated, service_role;