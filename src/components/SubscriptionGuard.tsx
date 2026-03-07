import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { hasValidSubscription } from "@/utils/subscriptionHelpers";
import { Loader2 } from "lucide-react";

/**
 * Wraps protected routes to enforce valid subscription.
 * If no valid subscription → redirect to /onboarding/payment
 */
export const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    const valid = hasValidSubscription(user as any);
    console.log('[SubscriptionGuard] user:', user.id, 'subscription_tier:', (user as any).subscription_tier, 'valid:', valid, 'path:', location.pathname);

    if (!valid) {
      console.log('[SubscriptionGuard] ❌ No valid subscription, redirecting to /onboarding/payment');
      if (!location.pathname.includes('/onboarding/payment')) {
        navigate('/onboarding/payment', { replace: true });
      }
    }
  }, [loading, user, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (!hasValidSubscription(user as any)) return null;

  return <>{children}</>;
};
