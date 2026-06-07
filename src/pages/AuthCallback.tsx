import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  isNativeiOS,
  clearNativeLoginInProgress,
  setCallbackInProgress,
  NATIVE_AUTH_COMPLETED_KEY,
  storeNativeTokens,
  parseCallbackParams,
  getSanitisedAuth0Domain,
  AUTH0_NATIVE_REDIRECT_URI,
  resetStaleNativeAuth,
} from '@/utils/nativeAuth';

const CALLBACK_TIMEOUT_MS = 10000;

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const nativeHandled = useRef(false);
  const [hasError, setHasError] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleRetry = useCallback(() => {
    clearTimeoutSafe();
    resetStaleNativeAuth();
    setHasError(false);
    navigate('/signup', { replace: true });
  }, [clearTimeoutSafe, navigate]);

  const handleHome = useCallback(() => {
    clearTimeoutSafe();
    resetStaleNativeAuth();
    navigate('/', { replace: true });
  }, [clearTimeoutSafe, navigate]);

  // Global timeout: if neither error nor auth resolves, show retry UI.
  useEffect(() => {
    timeoutRef.current = window.setTimeout(() => {
      if (!isAuthenticated) {
        console.warn('[AuthCallback] Timeout reached without resolution');
        setHasError(true);
      }
    }, CALLBACK_TIMEOUT_MS);
    return () => clearTimeoutSafe();
  }, [clearTimeoutSafe, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) clearTimeoutSafe();
  }, [isAuthenticated, clearTimeoutSafe]);

  // Native iOS: manually exchange the code
  useEffect(() => {
    if (!isNativeiOS()) return;
    if (nativeHandled.current) return;
    nativeHandled.current = true;

    // Mark callback in progress so ProtectedRoute won't trigger login
    setCallbackInProgress(true);

    // Parse params robustly from both query and hash
    const fullUrl = window.location.href;
    console.log('[AuthCallback] Native iOS callback, full URL:', fullUrl);

    const parsed = parseCallbackParams(fullUrl);
    console.log('[AuthCallback] Parsed params:', JSON.stringify(parsed));

    // Handle Auth0 error response
    if (parsed.error) {
      console.error('[AuthCallback] Auth0 error:', parsed.error, parsed.error_description);
      toast.error(parsed.error_description || 'Authentication failed. Please try again.');
      clearNativeLoginInProgress();
      setCallbackInProgress(false);
      navigate('/');
      return;
    }

    if (!parsed.code || !parsed.state) {
      console.error('[AuthCallback] Native callback missing code/state after robust parse');
      console.error('[AuthCallback] Diagnostic:', {
        href: window.location.href,
        search: window.location.search,
        hash: window.location.hash,
        parsedCode: parsed.code,
        parsedState: parsed.state,
      });
      toast.error('Authentication failed. Please try again.');
      clearNativeLoginInProgress();
      setCallbackInProgress(false);
      navigate('/');
      return;
    }

    const code = parsed.code;
    console.log('[AuthCallback] Native iOS callback, exchanging code...');

    (async () => {
      try {
        const codeVerifier = sessionStorage.getItem('native_auth_code_verifier');
        if (!codeVerifier) {
          console.error('[AuthCallback] Missing code_verifier');
          toast.error('Authentication session expired. Please try again.');
          clearNativeLoginInProgress();
          setCallbackInProgress(false);
          navigate('/');
          return;
        }

        const domain = getSanitisedAuth0Domain();
        const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
        const redirectUri = AUTH0_NATIVE_REDIRECT_URI;

        console.log('[AuthCallback] Token exchange with domain:', domain, 'redirectUri:', redirectUri);

        const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        });

        if (!tokenResponse.ok) {
          const errBody = await tokenResponse.text();
          console.error('[AuthCallback] Token exchange failed:', tokenResponse.status, errBody);
          toast.error('Authentication failed. Please try again.');
          clearNativeLoginInProgress();
          setCallbackInProgress(false);
          navigate('/');
          return;
        }

        const tokens = await tokenResponse.json();
        console.log('[AuthCallback] ✅ Token exchange successful');

        // Persist tokens for hydration by useAuth
        storeNativeTokens(tokens);
        localStorage.setItem(NATIVE_AUTH_COMPLETED_KEY, 'true');

        // Clean up PKCE
        sessionStorage.removeItem('native_auth_code_verifier');
        sessionStorage.removeItem('native_auth_state');

        const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
        sessionStorage.removeItem('auth0_return_to');

        console.log('[AuthCallback] ✅ Native auth complete, reloading to:', returnTo);
        toast.success('Welcome!');

        // Referral attribution is payment-only (handled by stripe-webhook)
        // No client-side referral tracking needed here

        // Clear login flags, keep callbackInProgress until reload completes
        clearNativeLoginInProgress();

        // Full reload so useAuth hydrates from native tokens
        window.location.href = returnTo;
      } catch (e) {
        console.error('[AuthCallback] Native auth error:', e);
        clearNativeLoginInProgress();
        setCallbackInProgress(false);
        localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
        toast.error('Authentication failed. Please try again.');
        navigate('/');
      }
    })();
  }, [navigate]);

  // Web flow: standard Auth0 SDK handling
  useEffect(() => {
    if (isNativeiOS()) return;
    if (isLoading) return;

    if (error) {
      console.error('[AuthCallback] Auth0 callback error:', error);
      clearTimeoutSafe();
      toast.error('Authentication failed. Please try again.');
      setHasError(true);
      return;
    }

    if (isAuthenticated) {
      const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
      sessionStorage.removeItem('auth0_return_to');
      toast.success(`Welcome back${user?.given_name ? `, ${user.given_name}` : ''}!`);

      // Referral attribution is payment-only (handled by stripe-webhook)
      // No client-side referral tracking needed here

      navigate(returnTo);
    }
  }, [isLoading, error, isAuthenticated, navigate, user, getAccessTokenSilently, clearTimeoutSafe]);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4 bg-white border border-[#cfc7b8] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <AlertCircle className="w-10 h-10 mx-auto text-foreground/70" />
          <p className="text-base font-semibold text-foreground">
            We couldn't complete sign in. Please try again.
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
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
