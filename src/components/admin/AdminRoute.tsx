import { Link } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/hooks/useAuth';

/**
 * Guard for every /admin/* route.
 *   - If viewport/native is not desktop-web, show a friendly notice.
 *   - If the signed-in email is not in the allowlist, show 403.
 *
 * Server-side enforcement still runs inside every admin edge function; this
 * guard is a UX filter, not the security boundary.
 */
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdminEmail, isDesktopContext, canAccessAdmin } = useIsAdmin();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isDesktopContext) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-xl font-semibold">Admin Console is available on desktop only.</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Please open this URL on a desktop web browser to access the Admin Console.
        </p>
        <Link to="/executive-home" className="text-sm underline underline-offset-4">Return to app</Link>
      </div>
    );
  }

  if (!user || !isAdminEmail || !canAccessAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-xl font-semibold">403 — Not authorized</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Your account is not authorized to view the Admin Console.
        </p>
        <Link to="/executive-home" className="text-sm underline underline-offset-4">Return to app</Link>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;