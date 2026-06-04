import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { DEV_MODE } from '@/config/devMode';
import { CANONICAL_APP_URL } from '@/utils/authRedirect';
import {
  getRedirectUri,
  nativeLogin,
  nativeLoginHandled,
  NATIVE_AUTH_CANCELLED_EVENT,
  isNativeAuthBusy,
  isNativeAuthCompleted,
  isNativeAuthStale,
  resetStaleNativeAuth,
  hasRecoverableNativeSession,
  getSanitisedAuth0Audience,
} from '@/utils/nativeAuth';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { useAuth } from '@/hooks/useAuth';

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

type RedirectStatus = 'preparing' | 'redirecting' | 'error';
const REDIRECT_TIMEOUT_MS = 8000;
const CENTERED_SHELL = 'min-h-[100dvh] flex items-center justify-center bg-transparent px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]';

const Stage8SignupStep = () => {
  const { isLoading: auth0Loading, loginWithRedirect } = useAuth0();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);
  const completionInitiated = useRef(false);
  const inIframe = isInIframe();
  const { recordStep } = useOnboardingProgress();
  const [status, setStatus] = useState<RedirectStatus>('preparing');
  const [errorMessage, setErrorMessage] = useState<string>(
    "We couldn't open account creation. Please try again."
  );
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRedirect = useCallback(async () => {
    setStatus('redirecting');
    clearTimeoutSafe();
    timeoutRef.current = window.setTimeout(() => {
      console.warn('[Stage8] Redirect timeout reached');
      setErrorMessage("We couldn't open account creation. Please try again.");
      setStatus('error');
    }, REDIRECT_TIMEOUT_MS);

    try {
      const result = await nativeLogin({ returnTo: '/onboarding/results', screenHint: 'signup' });
      if (result.status === 'opened') {
        clearTimeoutSafe();
        return;
      }
      if (nativeLoginHandled(result)) {
        // Native took over (busy, completed, etc.) — wait for callback or retry state.
        return;
      }

      // Web fallback
      await loginWithRedirect({
        appState: { returnTo: '/onboarding/results' },
        authorizationParams: {
          redirect_uri: `${getRedirectUri()}?from=onboarding`,
          screen_hint: 'signup',
          audience: getSanitisedAuth0Audience(),
          scope: 'openid profile email offline_access',
        },
      });
    } catch (e) {
      console.error('[Stage8] Auth0 redirect failed:', e);
      clearTimeoutSafe();
      redirectInitiated.current = false;
      setErrorMessage("We couldn't open account creation. Please try again.");
      setStatus('error');
    }
  }, [clearTimeoutSafe, loginWithRedirect]);

  const handleRetry = useCallback(() => {
    resetStaleNativeAuth();
    redirectInitiated.current = false;
    setStatus('preparing');
    setAttempt((n) => n + 1);
  }, []);

  const handleBackToAssessment = useCallback(() => {
    clearTimeoutSafe();
    navigate('/onboarding/growth-intention');
  }, [clearTimeoutSafe, navigate]);

  useEffect(() => {
    const handleNativeCancel = () => {
      clearTimeoutSafe();
      redirectInitiated.current = false;
      setErrorMessage("We couldn't open account creation. Please try again.");
      setStatus('error');
    };

    window.addEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
    return () => window.removeEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
  }, [clearTimeoutSafe]);

  useEffect(() => {
    if (DEV_MODE) {
      navigate('/onboarding/results');
      return;
    }
    if (inIframe) return;
    if (auth0Loading || authLoading) return;

    if (isAuthenticated) {
      if (completionInitiated.current) return;
      completionInitiated.current = true;
      clearTimeoutSafe();

      (async () => {
        await recordStep('signup_step');
        navigate('/onboarding/results', { replace: true });
      })();
      return;
    }

    if (redirectInitiated.current) return;
    // If native auth is busy/completed but stale, allow retry; otherwise wait.
    const nativeCompleted = isNativeAuthCompleted();
    if (nativeCompleted && !hasRecoverableNativeSession()) {
      console.log('[Stage8] Stale native completion flag without tokens, clearing for fresh signup');
      resetStaleNativeAuth();
    } else if (isNativeAuthBusy() || nativeCompleted) {
      if (isNativeAuthStale()) {
        console.log('[Stage8] Stale native auth detected, clearing for retry');
        resetStaleNativeAuth();
      } else {
        console.log('[Stage8] Native auth in progress or completed, waiting...');
        // Arm a timeout so we don't sit on the spinner forever
        clearTimeoutSafe();
        timeoutRef.current = window.setTimeout(() => {
          if (!isAuthenticated) {
            setErrorMessage('Account creation was cancelled. Try again.');
            setStatus('error');
          }
        }, REDIRECT_TIMEOUT_MS);
        return;
      }
    }
    redirectInitiated.current = true;
    void startRedirect();
  }, [auth0Loading, authLoading, isAuthenticated, navigate, inIframe, recordStep, attempt, startRedirect, clearTimeoutSafe]);

  useEffect(() => () => clearTimeoutSafe(), [clearTimeoutSafe]);

  if (DEV_MODE) {
    return (
      <div className={CENTERED_SHELL}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting (dev mode)...</p>
        </div>
      </div>
    );
  }

  if (inIframe) {
    return (
      <div className={CENTERED_SHELL}>
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white border border-[#cfc7b8] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-lg font-semibold text-foreground">Sign up requires a full browser window</p>
          <p className="text-sm text-muted-foreground">
            Auth0 cannot load inside an iframe. Please open the app in a new tab to create your account.
          </p>
          <a
            href={`${CANONICAL_APP_URL}/onboarding/signup-step`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
          >
            Open in new tab <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={CENTERED_SHELL}>
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white border border-[#cfc7b8] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <AlertCircle className="w-10 h-10 mx-auto text-foreground/70" />
          <p className="text-base font-semibold text-foreground">{errorMessage}</p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleRetry}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
            >
              Try again
            </button>
            <button
              onClick={handleBackToAssessment}
              className="px-6 py-3 rounded-xl border border-[#cfc7b8] text-foreground hover:bg-black/[0.03] transition"
            >
              Back to assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CENTERED_SHELL}>
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">
          {status === 'redirecting' ? 'Opening account creation...' : 'Preparing account creation...'}
        </p>
      </div>
    </div>
  );
};

export default Stage8SignupStep;
