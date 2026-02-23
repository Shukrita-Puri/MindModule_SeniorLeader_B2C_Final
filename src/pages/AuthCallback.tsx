import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isNativeiOS, clearNativeLoginInProgress, NATIVE_AUTH_COMPLETED_KEY, storeNativeTokens } from '@/utils/nativeAuth';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated, user, handleRedirectCallback } = useAuth0();
  const navigate = useNavigate();
  const nativeHandled = useRef(false);

  // Native iOS: manually exchange the code using Auth0 SDK's handleRedirectCallback
  useEffect(() => {
    if (!isNativeiOS()) return;
    if (nativeHandled.current) return;
    nativeHandled.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      console.error('[AuthCallback] Native callback missing code/state');
      toast.error('Authentication failed. Please try again.');
      navigate('/');
      return;
    }

    console.log('[AuthCallback] Native iOS callback detected, letting Auth0 SDK handle exchange');
    // Auth0 SDK's handleRedirectCallback will pick up code+state from the URL
    // and exchange them. The SDK handles PKCE internally when it initiated the flow.
    // But since we bypassed loginWithRedirect, the SDK won't have the transaction.
    // We need to handle this differently - do a token exchange manually.

    (async () => {
      try {
        const codeVerifier = sessionStorage.getItem('native_auth_code_verifier');
        if (!codeVerifier) {
          console.error('[AuthCallback] Missing code_verifier for native PKCE exchange');
          toast.error('Authentication session expired. Please try again.');
          navigate('/');
          return;
        }

        const domain = import.meta.env.VITE_AUTH0_DOMAIN;
        const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
        const redirectUri = `app.mindmodule.me://callback`;

        // Exchange authorization code for tokens
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
          navigate('/');
          return;
        }

        const tokens = await tokenResponse.json();
        console.log('[AuthCallback] ✅ Native token exchange successful');

        // Store tokens in our dedicated native token store
        // (NOT the SDK cache — the SDK won't reliably pick those up)
        storeNativeTokens(tokens);

        // Signal that native auth completed — useAuth will hydrate from native tokens
        localStorage.setItem(NATIVE_AUTH_COMPLETED_KEY, 'true');

        // Clean up PKCE artifacts
        sessionStorage.removeItem('native_auth_code_verifier');
        sessionStorage.removeItem('native_auth_state');
        clearNativeLoginInProgress();

        const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
        sessionStorage.removeItem('auth0_return_to');

        console.log('[AuthCallback] ✅ Native auth complete, navigating to:', returnTo);
        toast.success('Welcome!');
        
        // Force a full reload so Auth0Provider picks up the cached tokens
        window.location.href = returnTo;
      } catch (e) {
        console.error('[AuthCallback] Native auth error:', e);
        clearNativeLoginInProgress();
        localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
        toast.error('Authentication failed. Please try again.');
        navigate('/');
      }
    })();
  }, [navigate]);

  // Web flow: standard Auth0 SDK handling
  useEffect(() => {
    if (isNativeiOS()) return; // handled above
    if (isLoading) return;

    if (error) {
      console.error('[AuthCallback] Auth0 callback error:', error);
      toast.error('Authentication failed. Please try again.');
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
      sessionStorage.removeItem('auth0_return_to');
      toast.success(`Welcome back${user?.given_name ? `, ${user.given_name}` : ''}!`);
      navigate(returnTo);
    }
  }, [isLoading, error, isAuthenticated, navigate, user]);

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
