import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  getRedirectUri,
  nativeLogin,
  nativeLoginHandled,
  resetStaleNativeAuth,
  getSanitisedAuth0Audience,
} from '@/utils/nativeAuth';
import { isLogoutGuardActive, clearLogoutGuard } from '@/utils/logoutGuard';

const REDIRECT_TIMEOUT_MS = 8000;

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  const isOnboardingFlow =
    location.pathname.includes('/onboarding') ||
    location.search.includes('from=onboarding');

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleRetry = useCallback(() => {
    resetStaleNativeAuth();
    redirectInitiated.current = false;
    setHasError(false);
    setAttempt((n) => n + 1);
  }, []);

  const handleHome = useCallback(() => {
    clearTimeoutSafe();
    navigate('/', { replace: true });
  }, [clearTimeoutSafe, navigate]);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      clearTimeoutSafe();
      navigate(isOnboardingFlow ? '/onboarding/results' : '/daily-check-in');
      return;
    }

    // Don't auto-trigger auth if user just signed out
    if (isLogoutGuardActive()) {
      console.log('[Signup] Logout guard active, skipping auto-signup');
      navigate('/', { replace: true });
      return;
    }

    if (redirectInitiated.current) return;
    redirectInitiated.current = true;

    clearLogoutGuard();

    const returnTo = isOnboardingFlow ? '/onboarding/results' : '/daily-check-in';

    clearTimeoutSafe();
    timeoutRef.current = window.setTimeout(() => {
      console.warn('[Signup] Redirect timeout reached');
      setHasError(true);
    }, REDIRECT_TIMEOUT_MS);

    (async () => {
      try {
        const result = await nativeLogin({ returnTo, screenHint: 'signup' });
        if (nativeLoginHandled(result)) return;

        const baseRedirect = getRedirectUri();
        const redirectUri = isOnboardingFlow
          ? `${baseRedirect}?from=onboarding`
          : baseRedirect;

        await loginWithRedirect({
          appState: { returnTo },
          authorizationParams: {
            redirect_uri: redirectUri,
            screen_hint: 'signup',
            audience: getSanitisedAuth0Audience(),
            scope: 'openid profile email offline_access',
          },
        });
      } catch (e) {
        console.error('[Signup] Auth0 redirect failed:', e);
        clearTimeoutSafe();
        redirectInitiated.current = false;
        setHasError(true);
      }
    })();
  }, [
    isLoading,
    isAuthenticated,
    navigate,
    loginWithRedirect,
    isOnboardingFlow,
    attempt,
    clearTimeoutSafe,
  ]);

  useEffect(() => () => clearTimeoutSafe(), [clearTimeoutSafe]);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          <AlertCircle className="w-10 h-10 mx-auto text-foreground/70" />
          <p className="text-base font-semibold text-foreground">
            We couldn't open account creation. Please try again.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleRetry}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
            >
              Try again
            </button>
            <button
              onClick={handleHome}
              className="px-6 py-3 rounded-xl border border-black/[0.08] text-foreground hover:bg-black/[0.03] transition"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to signup...</p>
      </div>
    </div>
  );
};

export default Signup;