import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEV_MODE } from "@/config/devMode";
import { Loader2 } from "lucide-react";
import { getResumeRoute } from "@/utils/onboardingStatus";

// Routes that completed users can still access (e.g. upgrade flow)
const ONBOARDING_WHITELIST = ['/onboarding/payment'];

/**
 * Wraps protected routes to enforce onboarding completion.
 * If onboarding_completed_at is NULL → fetch DB progress to find correct resume route
 * If onboarding_completed_at exists → allow through
 */
export const OnboardingGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (resolved) return;

    console.log('[OnboardingGuard] user:', user.id, 'onboarding_completed_at:', user.onboarding_completed_at, 'path:', location.pathname);

    if (user.onboarding_completed_at) {
      console.log('[OnboardingGuard] ✅ Onboarding completed, allowing access');
      setResolved(true);
      return;
    }

    // Not completed — fetch DB progress to find the correct resume route
    if (resolving) return;
    setResolving(true);

    (async () => {
      try {
        console.log('[OnboardingGuard] ⏳ Fetching DB progress for resume route...');
        const resumeRoute = await getResumeRoute();
        console.log('[OnboardingGuard] 📍 Resume route resolved:', resumeRoute);
        navigate(resumeRoute, { replace: true });
      } catch (err) {
        console.warn('[OnboardingGuard] Resume route fetch failed, falling back to /onboarding:', err);
        navigate('/onboarding', { replace: true });
      }
    })();
  }, [loading, user, navigate, location.pathname, resolving, resolved]);

  if (loading || resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (!user.onboarding_completed_at) return null;

  return <>{children}</>;
};

/**
 * Wraps the /onboarding route to prevent completed users from re-accessing it.
 * If onboarding_completed_at exists → redirect to /daily-check-in
 * EXCEPTION: whitelisted routes (e.g. /onboarding/payment for upgrade flow)
 * If authenticated but not completed → check DB progress and resume at correct step
 * If not authenticated → allow onboarding (anonymous assessment)
 */
export const OnboardingBlockGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [resumeChecked, setResumeChecked] = useState(false);
  const [resuming, setResuming] = useState(false);

  const isWhitelisted = ONBOARDING_WHITELIST.includes(location.pathname);
  const isOnboardingRoot = location.pathname === '/onboarding';

  useEffect(() => {
    if (loading) return;

    // DEV_MODE: skip all onboarding guards
    if (DEV_MODE) {
      console.log('[OnboardingBlockGuard] DEV_MODE active, allowing access');
      setResumeChecked(true);
      return;
    }

    // If not authenticated, allow onboarding (anonymous assessment)
    if (!isAuthenticated || !user) {
      console.log('[OnboardingBlockGuard] Not authenticated, allowing onboarding');
      setResumeChecked(true);
      return;
    }

    console.log('[OnboardingBlockGuard] user:', user.id, 'onboarding_completed_at:', user.onboarding_completed_at, 'path:', location.pathname, 'whitelisted:', isWhitelisted);

    // Completed user → redirect to dashboard (unless whitelisted)
    if (user.onboarding_completed_at && !isWhitelisted) {
      console.log('[OnboardingBlockGuard] ❌ Onboarding already completed, redirecting to /daily-check-in');
      navigate('/daily-check-in', { replace: true });
      return;
    }

    // Authenticated but not completed + landed on /onboarding root → check DB for resume
    if (!user.onboarding_completed_at && isOnboardingRoot && !resumeChecked && !resuming) {
      setResuming(true);
      (async () => {
        try {
          console.log('[OnboardingBlockGuard] ⏳ Authenticated user at /onboarding root, checking DB for resume...');
          const resumeRoute = await getResumeRoute();
          console.log('[OnboardingBlockGuard] 📍 DB resume route:', resumeRoute);

          // If DB says they should be past the welcome screen, redirect there
          if (resumeRoute && resumeRoute !== '/onboarding') {
            console.log('[OnboardingBlockGuard] 🔀 Resuming user at:', resumeRoute);
            navigate(resumeRoute, { replace: true });
          } else {
            console.log('[OnboardingBlockGuard] ✅ No progress found, allowing welcome screen');
          }
        } catch (err) {
          console.warn('[OnboardingBlockGuard] Resume check failed:', err);
        } finally {
          setResumeChecked(true);
          setResuming(false);
        }
      })();
      return;
    }

    setResumeChecked(true);
    console.log('[OnboardingBlockGuard] ✅ Allowing access');
  }, [loading, isAuthenticated, user, navigate, location.pathname, isWhitelisted, isOnboardingRoot, resumeChecked, resuming]);

  // Show loading while checking resume state for authenticated users
  if (loading || (isAuthenticated && !resumeChecked && !DEV_MODE)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If authenticated and onboarding completed and NOT whitelisted, block render
  if (!DEV_MODE && !loading && isAuthenticated && user?.onboarding_completed_at && !isWhitelisted) return null;

  return <>{children}</>;
};
