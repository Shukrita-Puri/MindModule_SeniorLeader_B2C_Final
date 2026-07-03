import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  getRedirectUri,
  nativeLogin,
  nativeLoginHandled,
  NATIVE_AUTH_CANCELLED_EVENT,
  resetStaleNativeAuth,
  getSanitisedAuth0Audience,
} from '@/utils/nativeAuth';
import { isLogoutGuardActive, clearLogoutGuard } from '@/utils/logoutGuard';
import PageSeo from '@/components/PageSeo';

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
      navigate(isOnboardingFlow ? '/onboarding/results' : '/executive-home');
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

    const returnTo = isOnboardingFlow ? '/onboarding/results' : '/executive-home';

    clearTimeoutSafe();
    timeoutRef.current = window.setTimeout(() => {
      console.warn('[Signup] Redirect timeout reached');
      setHasError(true);
    }, REDIRECT_TIMEOUT_MS);

    (async () => {
      try {
        const result = await nativeLogin({ returnTo, screenHint: 'signup' });
        if (result.status === 'opened') {
          clearTimeoutSafe();
          return;
        }
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

  useEffect(() => {
    const handleNativeCancel = () => {
      clearTimeoutSafe();
      redirectInitiated.current = false;
      setHasError(true);
    };

    window.addEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
    return () => window.removeEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
  }, [clearTimeoutSafe]);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white border border-[#cfc7b8] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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
              className="px-6 py-3 rounded-xl border border-[#cfc7b8] text-foreground hover:bg-black/[0.03] transition"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <PageSeo
        title="Join Mind Module — Create your account"
        description="Create your Mind Module account and start using the proactive mental performance OS for leaders."
        path="/signup"
      />
      <div className="text-center">
        <h1 className="sr-only">Join Mind Module</h1>
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to signup...</p>
      </div>
    </div>
  );
};

export default Signup;
