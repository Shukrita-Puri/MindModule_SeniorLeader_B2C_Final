import { useImpersonation } from '@/hooks/useImpersonation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Global banner shown on every page while an admin is impersonating another
 * user. Mounted once at the App root (see App.tsx).
 */
const ImpersonationBanner = () => {
  const { session, isImpersonating, stop } = useImpersonation();
  if (!isImpersonating || !session) return null;
  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-black px-4 py-2 shadow-lg flex items-center justify-center gap-3 text-sm"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <span className="font-medium">
        Admin viewing as{' '}
        <span className="font-semibold">
          {session.target.name ? `${session.target.name} — ` : ''}
          {session.target.email || session.target.id}
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="ml-2 h-7 px-3 text-xs"
        onClick={() => { void stop(); }}
      >
        Exit impersonation
      </Button>
    </div>
  );
};

export default ImpersonationBanner;