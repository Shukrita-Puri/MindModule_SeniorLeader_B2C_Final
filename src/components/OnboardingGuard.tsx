import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

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
 * If NULL → allow onboarding flow
 */
export const OnboardingBlockGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // If not authenticated, allow onboarding (anonymous assessment)
    if (!isAuthenticated || !user) {
      console.log('[OnboardingBlockGuard] Not authenticated, allowing onboarding');
      return;
    }

    console.log('[OnboardingBlockGuard] user:', user.id, 'onboarding_completed_at:', user.onboarding_completed_at);

    if (user.onboarding_completed_at) {
      console.log('[OnboardingBlockGuard] ❌ Onboarding already completed, redirecting to /daily-check-in');
      navigate('/daily-check-in', { replace: true });
    } else {
      console.log('[OnboardingBlockGuard] ✅ Onboarding not completed, allowing access');
    }
  }, [loading, isAuthenticated, user, navigate]);

  // If authenticated and onboarding completed, block render
  if (!loading && isAuthenticated && user?.onboarding_completed_at) return null;

  return <>{children}</>;
};
