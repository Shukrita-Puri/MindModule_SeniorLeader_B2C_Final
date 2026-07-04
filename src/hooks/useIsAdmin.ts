import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { isAllowlistedAdminEmail } from '@/config/adminAllowlist';
import { isNativeApp } from '@/utils/nativeAuth';

/**
 * True only when:
 *   - the authenticated user's email is in the admin allowlist, AND
 *   - we're running in a desktop/web browser (not the iOS/Capacitor app), AND
 *   - the viewport is not the mobile breakpoint.
 *
 * This is UI visibility only. Every admin edge function enforces the same
 * allowlist server-side; never trust this hook for authorization.
 */
export function useIsAdmin(): {
  isAdminEmail: boolean;
  isDesktopContext: boolean;
  canAccessAdmin: boolean;
} {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [native, setNative] = useState(false);

  useEffect(() => {
    // isNativeApp() reads Capacitor globals — safe on web (returns false).
    setNative(isNativeApp());
  }, []);

  const isAdminEmail = isAllowlistedAdminEmail(user?.email ?? null);
  const isDesktopContext = !native && !isMobile;
  return {
    isAdminEmail,
    isDesktopContext,
    canAccessAdmin: isAdminEmail && isDesktopContext,
  };
}