import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { isMobileDevice, isInIframe } from '@/utils/authRedirect';
import { Button } from '@/components/ui/button';

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';
  const urlParams = new URLSearchParams(window.location.search);
  const returnToParam = urlParams.get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  // Clear login flag when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      setIsLoggingIn(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Don't auto-trigger in iframe - show button instead
    if (isInIframe()) return;
    
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
          redirect_uri: `${window.location.origin}/callback`,
          scope: 'openid profile email',
        },
      });
    } else {
      // Desktop: Use popup-based auth
      loginWithPopup({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
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

  // Handle login button click in iframe
  const handleIframeLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithPopup({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
          scope: 'openid profile email',
        },
      });
      navigate(finalDestination);
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoggingIn(false);
    }
  };

  // In iframe: show login button
  if (isInIframe() && !isAuthenticated && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-xl font-heading font-semibold text-foreground">Login Required</h2>
          <p className="text-muted-foreground text-sm">
            Click below to log in via popup. You'll return here once authenticated.
          </p>
          <Button 
            onClick={handleIframeLogin}
            disabled={isLoggingIn}
            className="gap-2"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            {isLoggingIn ? 'Logging in...' : 'Log in'}
          </Button>
        </div>
      </div>
    );
  }

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
