import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
} from '@/utils/nativeAuth';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const nativeHandled = useRef(false);

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

        const returnTo = sessionStorage.getItem('auth0_return_to') || '/daily-check-in';
        sessionStorage.removeItem('auth0_return_to');

        console.log('[AuthCallback] ✅ Native auth complete, reloading to:', returnTo);
        toast.success('Welcome!');

        // Referral tracking moved to Stage8Results (two-stage attribution)
        // localStorage('referral_code') preserved for payment page

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
      toast.error('Authentication failed. Please try again.');
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      const returnTo = sessionStorage.getItem('auth0_return_to') || '/daily-check-in';
      sessionStorage.removeItem('auth0_return_to');
      toast.success(`Welcome back${user?.given_name ? `, ${user.given_name}` : ''}!`);

      // Referral tracking moved to Stage8Results (two-stage attribution)
      // localStorage('referral_code') preserved for payment page

      navigate(returnTo);
    }
  }, [isLoading, error, isAuthenticated, navigate, user, getAccessTokenSilently]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
