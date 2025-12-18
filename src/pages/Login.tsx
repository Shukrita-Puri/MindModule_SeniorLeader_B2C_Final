import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isMobileDevice, CANONICAL_APP_URL } from '@/utils/authRedirect';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);

  // Get intended destination from state or URL param
  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';
  const urlParams = new URLSearchParams(window.location.search);
  const returnToParam = urlParams.get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  useEffect(() => {
    console.log('[Login] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      isMobile: isMobileDevice(),
      finalDestination
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Login] Already authenticated, navigating to:', finalDestination);
      navigate(finalDestination);
      return;
    }

    // Prevent multiple redirect attempts
    if (redirectInitiated.current) {
      console.log('[Login] Login already initiated, skipping');
      return;
    }

    redirectInitiated.current = true;

    if (isMobileDevice()) {
      // Mobile: Use redirect-based auth (popups unreliable on mobile)
      console.log('[Login] Mobile device, using redirect auth');
      loginWithRedirect({
        appState: { returnTo: finalDestination },
        authorizationParams: {
          redirect_uri: `${CANONICAL_APP_URL}/callback`,
          scope: 'openid profile email',
        },
      });
    } else {
      // Desktop: Use popup-based auth (allows staying in iframe)
      console.log('[Login] Desktop, using popup auth');
      loginWithPopup({
        authorizationParams: {
          redirect_uri: `${CANONICAL_APP_URL}/callback`,
          scope: 'openid profile email',
        },
      }).then(() => {
        console.log('[Login] Popup login successful, navigating to:', finalDestination);
        navigate(finalDestination);
      }).catch((error) => {
        console.error('[Login] Popup login error:', error);
        redirectInitiated.current = false; // Allow retry
      });
    }
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, loginWithPopup, finalDestination]);

  // Show loading spinner while auth is in progress
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
