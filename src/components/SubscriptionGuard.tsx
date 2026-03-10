/**
 * SubscriptionGuard — wraps protected routes to enforce valid subscription.
 * 
 * Allows access when:
 *   - subscription_status is 'trialing' or 'active'
 *   - user has valid beta access (beta_user=true AND beta_expires_at > now)
 * 
 * Shows UpgradeModal when access is restricted.
 * Does NOT block /profile route (handled by removing guard from that route in App.tsx).
 */

import { useAuth } from '@/hooks/useAuth';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';

function hasValidAccess(user: any): boolean {
  if (!user) return false;

  // Beta access check
  if (user.beta_user && user.beta_expires_at) {
    if (new Date(user.beta_expires_at) > new Date()) {
      return true;
    }
  }

  const status = user.subscription_status;
  
  // Active or trialing subscriptions
  if (status === 'trialing' || status === 'active') {
    // For trials, also check trial_ends_at hasn't expired
    if (status === 'trialing' && user.trial_ends_at) {
      return new Date(user.trial_ends_at) > new Date();
    }
    return true;
  }

  // Legacy 'trial' status — treat as trialing if trial_ends_at is still valid
  if (status === 'trial' && user.trial_ends_at) {
    return new Date(user.trial_ends_at) > new Date();
  }

  return false;
}

export const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  // Still loading — show nothing to prevent flash
  if (loading) return null;

  // No user — let ProtectedRoute handle redirect
  if (!user) return <>{children}</>;

  // Valid access — pass through
  if (hasValidAccess(user)) {
    return <>{children}</>;
  }

  // Restricted — show upgrade modal (non-dismissable since access is blocked)
  return <UpgradeModal sessionsRemaining={0} onClose={() => {}} />;
};
