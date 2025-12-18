import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isMobileDevice, isInIframe, openAuthInNewTab, CANONICAL_APP_URL } from '@/utils/authRedirect';

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();

  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';
  const urlParams = new URLSearchParams(window.location.search);
  const returnToParam = urlParams.get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  // Clear login flag when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const loginInProgress = sessionStorage.getItem(LOGIN_TRIGGERED_KEY);

    if (isLoading) return;

    if (isAuthenticated) {
      navigate(finalDestination);
      return;
    }

    if (loginInProgress === 'true') return;

    sessionStorage.setItem(LOGIN_TRIGGERED_KEY, 'true');

    if (isMobileDevice()) {
      // Mobile: Use redirect-based auth
      loginWithRedirect({
        appState: { returnTo: finalDestination },
        authorizationParams: {
          redirect_uri: `${CANONICAL_APP_URL}/callback`,
          scope: 'openid profile email',
        },
      });
    } else if (isInIframe()) {
      // Desktop in iframe: Open auth in new tab
      openAuthInNewTab(finalDestination);
    } else {
      // Desktop outside iframe: Use popup-based auth
      loginWithPopup({
        authorizationParams: {
          redirect_uri: `${CANONICAL_APP_URL}/callback`,
          scope: 'openid profile email',
        },
      }).then(() => {
        sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
        navigate(finalDestination);
      }).catch(() => {
        sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      });
    }
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, loginWithPopup, finalDestination]);

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
