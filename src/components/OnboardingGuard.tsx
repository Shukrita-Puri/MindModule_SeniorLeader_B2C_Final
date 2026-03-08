import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEV_MODE } from "@/config/devMode";
import { Loader2 } from "lucide-react";

// Routes that completed users can still access (e.g. upgrade flow)
const ONBOARDING_WHITELIST = ['/onboarding/payment'];

/**
 * Wraps protected routes to enforce onboarding completion.
 * If onboarding_completed_at is NULL → redirect to /onboarding
 * If onboarding_completed_at exists → allow through
 */
export const OnboardingGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    console.log('[OnboardingGuard] user:', user.id, 'onboarding_completed_at:', user.onboarding_completed_at, 'path:', location.pathname);

    if (!user.onboarding_completed_at) {
      console.log('[OnboardingGuard] ❌ Onboarding not completed, redirecting to /onboarding');
      navigate('/onboarding', { replace: true });
    } else {
      console.log('[OnboardingGuard] ✅ Onboarding completed, allowing access');
    }
  }, [loading, user, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Still waiting for user profile
  if (!user) return null;

  // Block render if onboarding not completed
  if (!user.onboarding_completed_at) return null;

  return <>{children}</>;
};

/**
 * Wraps the /onboarding route to prevent completed users from re-accessing it.
 * If onboarding_completed_at exists → redirect to /daily-check-in
 * EXCEPTION: whitelisted routes (e.g. /onboarding/payment for upgrade flow)
 * If NULL → allow onboarding flow
 */
export const OnboardingBlockGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isWhitelisted = ONBOARDING_WHITELIST.includes(location.pathname);

  useEffect(() => {
    if (loading) return;

    // DEV_MODE: skip all onboarding guards
    if (DEV_MODE) {
      console.log('[OnboardingBlockGuard] DEV_MODE active, allowing access');
      return;
    }

    // If not authenticated, allow onboarding (anonymous assessment)
    if (!isAuthenticated || !user) {
      console.log('[OnboardingBlockGuard] Not authenticated, allowing onboarding');
      return;
    }

    console.log('[OnboardingBlockGuard] user:', user.id, 'onboarding_completed_at:', user.onboarding_completed_at, 'path:', location.pathname, 'whitelisted:', isWhitelisted);

    if (user.onboarding_completed_at && !isWhitelisted) {
      console.log('[OnboardingBlockGuard] ❌ Onboarding already completed, redirecting to /daily-check-in');
      navigate('/daily-check-in', { replace: true });
    } else {
      console.log('[OnboardingBlockGuard] ✅ Allowing access');
    }
  }, [loading, isAuthenticated, user, navigate, location.pathname, isWhitelisted]);

  // If authenticated and onboarding completed and NOT whitelisted, block render
  if (!DEV_MODE && !loading && isAuthenticated && user?.onboarding_completed_at && !isWhitelisted) return null;

  return <>{children}</>;
};
