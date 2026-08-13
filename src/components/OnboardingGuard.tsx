import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DEV_MODE } from "@/config/devMode";
import { getResumeRoute } from "@/utils/onboardingStatus";
import { fetchOnboardingProgressSnapshot, isOnboardingCompleteSnapshot } from "@/utils/onboardingCompletion";
import DelayedFallback from "@/components/ui/delayed-fallback";
import { PAYMENT_PAGE_SUPPRESSED } from "@/config/payments";
import { markV8Complete } from "@/utils/onboardingV8";

// Routes that completed users can still access outside the onboarding flow.
const ONBOARDING_WHITELIST = PAYMENT_PAGE_SUPPRESSED ? [] : ['/upgrade'];

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
  const refreshAttemptedRef = useRef(false);

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

        // Recovery: if profile.onboarding_completed_at is set but v8 row is
        // still incomplete, reconcile by calling markV8Complete (idempotent).
        if (completionState === 'incomplete' && user?.onboarding_completed_at) {
          console.log('[OnboardingGuard] ⚠️ Profile says complete but v8 row incomplete — recovering');
          try { await markV8Complete(); } catch { /* best-effort */ }
          setResolved(true);
          setResolving(false);
          return;
        }

        if (completionState === 'unknown') {
          console.log('[OnboardingGuard] ⏳ Completion state unresolved, failing open to avoid false onboarding redirect');
          setResolved(true);
          return;
        }

        // Refresh the profile at most once so a fresh completion flag can land.
        // refreshProfile() returns true whenever the network call succeeded —
        // NOT "the user is now complete" — so it must never gate navigation on
        // repeat passes, otherwise the guard loops forever on the loader.
        if (!refreshAttemptedRef.current) {
          refreshAttemptedRef.current = true;
          await refreshProfile();
          setResolving(false);
          return;
        }

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

  // Silent during the typical sub-3s reconciliation; only fall back to a
  // generic loader if it stretches past 3s. This stops session/onboarding
  // verification from stacking on top of page-specific loaders.
  if (loading || (!resolved && user && !user.onboarding_completed_at)) {
    return <DelayedFallback />;
  }

  if (!user) return null;
  if (!resolved && !user.onboarding_completed_at) return null;

  return <>{children}</>;
};

/**
 * Wraps the /onboarding route to prevent completed users from re-accessing it.
 * Blocks ALL onboarding subroutes for completed users, not just the root.
 * Exception: whitelisted routes (e.g. /upgrade for upgrade flow).
 */
export const OnboardingBlockGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAuthenticated, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const isWhitelisted = ONBOARDING_WHITELIST.includes(location.pathname);
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
      navigate('/executive-home', { replace: true });
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
          navigate('/executive-home', { replace: true });
          return;
        }

        // Authenticated, incomplete users at the root should see the intro
        // sequence first. The route index handles /onboarding -> /onboarding/app-intro.

        // For non-root routes: stage gating in OnboardingFlow handles progression
      } catch (err) {
        console.warn('[OnboardingBlockGuard] Check failed:', err);
      } finally {
        setChecked(true);
        setChecking(false);
      }
    })();
  }, [loading, isAuthenticated, user, navigate, location.pathname, isWhitelisted, refreshProfile, checked, checking]);

  // Same silent-then-delayed pattern as OnboardingGuard above.
  if (loading || (isAuthenticated && !checked && !DEV_MODE)) {
    return <DelayedFallback />;
  }

  // Block render while redirect happens for completed users
  if (!DEV_MODE && !loading && isAuthenticated && user?.onboarding_completed_at && !isWhitelisted) return null;

  return <>{children}</>;
};
