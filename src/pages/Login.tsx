import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import {
  getRedirectUri,
  nativeLogin,
  nativeLoginHandled,
  NATIVE_AUTH_CANCELLED_EVENT,
  getSanitisedAuth0Audience,
  isNativeAuthBusy,
  isNativeAuthCompleted,
  isNativeAuthStale,
  resetStaleNativeAuth,
  hasRecoverableNativeSession,
} from '@/utils/nativeAuth';
import { isLogoutGuardActive, clearLogoutGuard } from '@/utils/logoutGuard';
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

const Login = () => {
  const { isAuthenticated: sdkIsAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { isAuthenticated: appIsAuthenticated, loading: appAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<RedirectStatus>('preparing');
  const [attempt, setAttempt] = useState(0);

  const intendedDestination = (location.state as { from?: string })?.from || '/daily-check-in';
  const urlParams = new URLSearchParams(window.location.search);
  const returnToParam = urlParams.get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  const inIframe = isInIframe();

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
      console.warn('[Login] Redirect timeout reached');
      setStatus('error');
    }, REDIRECT_TIMEOUT_MS);

    try {
      const result = await nativeLogin({ returnTo: finalDestination });
      if (result.status === 'opened') {
        clearTimeoutSafe();
        return;
      }
      if (nativeLoginHandled(result)) return;

      await loginWithRedirect({
        appState: { returnTo: finalDestination },
        authorizationParams: {
          redirect_uri: getRedirectUri(),
          audience: getSanitisedAuth0Audience(),
          scope: 'openid profile email offline_access',
        },
      });
    } catch (e) {
      console.error('[Login] Auth0 redirect failed:', e);
      clearTimeoutSafe();
      redirectInitiated.current = false;
      setStatus('error');
    }
  }, [clearTimeoutSafe, finalDestination, loginWithRedirect]);

  const handleRetry = useCallback(() => {
    clearTimeoutSafe();
    resetStaleNativeAuth();
    redirectInitiated.current = false;
    setStatus('preparing');
    setAttempt((n) => n + 1);
  }, [clearTimeoutSafe]);

  const handleHome = useCallback(() => {
    clearTimeoutSafe();
    resetStaleNativeAuth();
    navigate('/', { replace: true });
  }, [clearTimeoutSafe, navigate]);

  useEffect(() => {
    if (inIframe) return;
    if (isLoading || appAuthLoading) return;

    if (sdkIsAuthenticated || appIsAuthenticated) {
      clearTimeoutSafe();
      navigate(finalDestination);
      return;
    }

    // Don't auto-trigger auth if user just signed out
    if (isLogoutGuardActive()) {
      console.log('[Login] Logout guard active, skipping auto-login');
      navigate('/', { replace: true });
      return;
    }

    if (redirectInitiated.current) return;
    const nativeCompleted = isNativeAuthCompleted();
    if (nativeCompleted && !hasRecoverableNativeSession()) {
      console.log('[Login] Stale native completion flag without tokens, clearing for fresh login');
      resetStaleNativeAuth();
    } else if (isNativeAuthBusy() || nativeCompleted) {
      if (isNativeAuthStale()) {
        console.log('[Login] Stale native auth detected, clearing for retry');
        resetStaleNativeAuth();
      } else {
        console.log('[Login] Native auth in progress or completed, waiting...');
        clearTimeoutSafe();
        timeoutRef.current = window.setTimeout(() => {
          if (!sdkIsAuthenticated && !appIsAuthenticated) setStatus('error');
        }, REDIRECT_TIMEOUT_MS);
        return;
      }
    }
    redirectInitiated.current = true;

    // Clear guard since user explicitly navigated to /login
    clearLogoutGuard();

    void startRedirect();
  }, [isLoading, appAuthLoading, sdkIsAuthenticated, appIsAuthenticated, navigate, finalDestination, inIframe, clearTimeoutSafe, startRedirect, attempt]);

  useEffect(() => () => clearTimeoutSafe(), [clearTimeoutSafe]);

  useEffect(() => {
    const handleNativeCancel = () => {
      clearTimeoutSafe();
      redirectInitiated.current = false;
      setStatus('error');
    };

    window.addEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
    return () => window.removeEventListener(NATIVE_AUTH_CANCELLED_EVENT, handleNativeCancel);
  }, [clearTimeoutSafe]);

  if (inIframe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4">
          <p className="text-[15px] font-medium text-foreground">Login requires a full browser window</p>
          <p className="text-sm text-muted-foreground">
            Auth0 cannot load inside an iframe. Please open the app in a new tab to sign in.
          </p>
          <a
            href="https://app.mindmodule.me/login"
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
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          <AlertCircle className="w-10 h-10 mx-auto text-foreground/70" />
          <p className="text-base font-semibold text-foreground">
            We couldn't open login. Please try again.
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
        <p className="text-muted-foreground">
          {status === 'redirecting' ? 'Opening login...' : 'Preparing login...'}
        </p>
      </div>
    </div>
  );
};

export default Login;
