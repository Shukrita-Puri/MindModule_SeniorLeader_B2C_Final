import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEV_MODE } from "@/config/devMode";
import { Loader2 } from "lucide-react";
import { getResumeRoute } from "@/utils/onboardingStatus";
import { fetchOnboardingProgressSnapshot, isOnboardingCompleteSnapshot } from "@/utils/onboardingCompletion";

// Routes that completed users can still access (e.g. upgrade flow)
const ONBOARDING_WHITELIST = ['/onboarding/payment'];

/**
 * Check if onboarding is complete by querying DB progress.
 */
async function checkDbOnboardingCompletion(): Promise<boolean> {
  try {
    const snapshot = await fetchOnboardingProgressSnapshot();
    return isOnboardingCompleteSnapshot(snapshot);
  } catch {
    return false;
  }
}

async function resolveDbCompletion(): Promise<'complete' | 'incomplete' | 'unknown'> {
  try {
    const snapshot = await fetchOnboardingProgressSnapshot();
    if (!snapshot) return 'unknown';
    return isOnboardingCompleteSnapshot(snapshot) ? 'complete' : 'incomplete';
  } catch {
    return 'unknown';
  }
}

/**
 * Wraps protected routes to enforce onboarding completion.
 * Shows loading until completion is definitively resolved — never
 * redirects an authenticated user into /onboarding based on stale state.
 */
export const OnboardingGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (resolved) return;

    // Fast path: profile says completed
    if (user.onboarding_completed_at) {
      setResolved(true);
      return;
    }

    // Slow path: reconcile via DB — show loading, never redirect prematurely
    if (resolving) return;
    setResolving(true);

    (async () => {
      try {
        const completionState = await resolveDbCompletion();
        if (completionState === 'complete') {
          console.log('[OnboardingGuard] ✅ DB says onboarding completed, allowing access');
          await refreshProfile();
          setResolved(true);
          setResolving(false);
          return;
        }

        if (completionState === 'unknown') {
          console.log('[OnboardingGuard] ⏳ Completion state unresolved, failing open to avoid false onboarding redirect');
          setResolved(true);
          return;
        }

        await refreshProfile();
        if (!user?.onboarding_completed_at) {
          console.log('[OnboardingGuard] ⏳ User onboarding incomplete, resolving resume route...');
          const resumeRoute = await getResumeRoute();
          console.log('[OnboardingGuard] 📍 Resume route:', resumeRoute);
          navigate(resumeRoute, { replace: true });
          return;
        }
        setResolved(true);
      } catch (err) {
        console.warn('[OnboardingGuard] Resume route fetch failed, falling back to /onboarding:', err);
        navigate('/onboarding', { replace: true });
      } finally {
        setResolving(false);
      }
    })();
  }, [loading, user, navigate, location.pathname, refreshProfile, resolving, resolved]);

  // Show loading while auth is loading OR while we're reconciling completion
  if (loading || (!resolved && user && !user.onboarding_completed_at)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (!resolved && !user.onboarding_completed_at) return null;

  return <>{children}</>;
};

/**
 * Wraps the /onboarding route to prevent completed users from re-accessing it.
 * Blocks ALL onboarding subroutes for completed users, not just the root.
 * Exception: whitelisted routes (e.g. /onboarding/payment for upgrade flow).
 */
export const OnboardingBlockGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAuthenticated, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const isWhitelisted = ONBOARDING_WHITELIST.includes(location.pathname);
  const isOnboardingRoot = location.pathname === '/onboarding';

  useEffect(() => {
    if (loading) return;

    // DEV_MODE: skip all onboarding guards
    if (DEV_MODE) {
      setChecked(true);
      return;
    }

    // Not authenticated → allow onboarding (anonymous assessment)
    if (!isAuthenticated || !user) {
      setChecked(true);
      return;
    }

    // Fast path: profile says completed → block all onboarding routes (except whitelist)
    if (user.onboarding_completed_at && !isWhitelisted) {
      console.log('[OnboardingBlockGuard] ❌ Completed user on', location.pathname, '→ redirecting to /daily-check-in');
      navigate('/daily-check-in', { replace: true });
      return;
    }

    // Already checked this cycle
    if (checked || checking) return;
    setChecking(true);

    (async () => {
      try {
        // Reconcile: check DB for completion
        const dbCompleted = await checkDbOnboardingCompletion();

        if (dbCompleted && !isWhitelisted) {
          console.log('[OnboardingBlockGuard] DB says completed → redirecting to /daily-check-in');
          await refreshProfile();
          navigate('/daily-check-in', { replace: true });
          return;
        }

        // Authenticated, incomplete — if at root, check for resume
        if (isOnboardingRoot) {
          const resumeRoute = await getResumeRoute();
          if (resumeRoute && resumeRoute !== '/onboarding') {
            console.log('[OnboardingBlockGuard] 🔀 Resuming at:', resumeRoute);
            navigate(resumeRoute, { replace: true });
            return;
          }
        }

        // For non-root routes: stage gating in OnboardingFlow handles progression
      } catch (err) {
        console.warn('[OnboardingBlockGuard] Check failed:', err);
      } finally {
        setChecked(true);
        setChecking(false);
      }
    })();
  }, [loading, isAuthenticated, user, navigate, location.pathname, isWhitelisted, isOnboardingRoot, refreshProfile, checked, checking]);

  // Show loading while checking for authenticated users
  if (loading || (isAuthenticated && !checked && !DEV_MODE)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Block render while redirect happens for completed users
  if (!DEV_MODE && !loading && isAuthenticated && user?.onboarding_completed_at && !isWhitelisted) return null;

  return <>{children}</>;
};
