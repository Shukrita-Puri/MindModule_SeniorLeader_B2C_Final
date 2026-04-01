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
import { resolveSubscriptionAccess } from '@/utils/subscriptionHelpers';

export const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  // Still loading — render children with opacity 0 to prevent layout shift and blank flash
  if (loading) return <div className="opacity-0">{children}</div>;

  // No user — let ProtectedRoute handle redirect
  if (!user) return <>{children}</>;

  const decision = resolveSubscriptionAccess(user);

  if (decision === 'allow') {
    return <>{children}</>;
  }

  if (decision === 'pending') {
    console.log('[SubscriptionGuard] Failing open while subscription state is unresolved', {
      user_id: user.id,
      subscription_status: user.subscription_status,
      subscription_tier: user.subscription_tier,
      onboarding_completed: user.onboarding_completed_at,
    });
    return <>{children}</>;
  }

  console.warn('[SubscriptionGuard] Blocking user with confirmed invalid subscription state', {
    user_id: user.id,
    subscription_status: user.subscription_status,
    subscription_tier: user.subscription_tier,
    onboarding_completed: user.onboarding_completed_at,
  });

  return <UpgradeModal sessionsRemaining={0} onClose={() => {}} />;
};
