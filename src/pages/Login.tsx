import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isInIframe, CANONICAL_APP_URL } from '@/utils/authRedirect';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);

  // Get intended destination from ProtectedRoute's state
  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';

  useEffect(() => {
    console.log('[Login] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname,
      redirectInitiated: redirectInitiated.current,
      isInIframe: isInIframe(),
      intendedDestination
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Login] Already authenticated, redirecting to:', intendedDestination);
      navigate(intendedDestination);
      return;
    }

    // Prevent multiple redirect attempts
    if (redirectInitiated.current) {
      console.log('[Login] Redirect already initiated, skipping');
      return;
    }

    redirectInitiated.current = true;

    // If in iframe, open Auth0 in a new tab at the canonical URL
    if (isInIframe()) {
      console.log('[Login] Running in iframe, opening Auth0 in new tab');
      // Open the canonical app URL which will trigger Auth0 login
      const authUrl = `${CANONICAL_APP_URL}/login?returnTo=${encodeURIComponent(intendedDestination)}`;
      window.open(authUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Check if returnTo was passed via URL param (from iframe redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const returnToParam = urlParams.get('returnTo');
    const finalDestination = returnToParam || intendedDestination;

    console.log('[Login] Initiating Auth0 redirect flow, returnTo:', finalDestination);
    
    loginWithRedirect({
      appState: { returnTo: finalDestination },
      authorizationParams: {
        redirect_uri: `${CANONICAL_APP_URL}/callback`,
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, intendedDestination]);

  // Show only a brief loading spinner - no intermediate messages
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
};

export default Login;
