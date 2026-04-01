/**
 * SubscriptionGuard — wraps protected routes to enforce valid subscription.
 * 
 * Uses the CANONICAL hasValidAccess() from subscriptionHelpers.
 * Does NOT implement its own access logic.
 * 
 * Shows UpgradeModal when access is restricted.
 * Does NOT block /profile route (handled by removing guard from that route in App.tsx).
 */

import { useAuth } from '@/hooks/useAuth';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { hasValidAccess } from '@/utils/subscriptionHelpers';

export const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  // Still loading — render children with opacity 0 to prevent layout shift and blank flash
  if (loading) return <div className="opacity-0">{children}</div>;

  // No user — let ProtectedRoute handle redirect
  if (!user) return <>{children}</>;

  // Valid access — pass through
  if (hasValidAccess(user)) {
    return <>{children}</>;
  }

  // Restricted — show upgrade modal (non-dismissable since access is blocked)
  return <UpgradeModal sessionsRemaining={0} onClose={() => {}} />;
};
