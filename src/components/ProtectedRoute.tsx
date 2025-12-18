import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2, LogIn } from "lucide-react";
import { isMobileDevice, isInIframe } from "@/utils/authRedirect";
import { Button } from "@/components/ui/button";

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, loginWithPopup, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Clear login flag when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      setIsLoggingIn(false);
    }
  }, [isAuthenticated]);

  // Auto-trigger login for top-level (non-iframe) contexts
  useEffect(() => {
    // Only auto-trigger if NOT in iframe
    if (isInIframe()) return;
    
    const loginInProgress = sessionStorage.getItem(LOGIN_TRIGGERED_KEY);
    
    if (!loading && !auth0Loading && !isAuthenticated && loginInProgress !== 'true') {
      sessionStorage.setItem(LOGIN_TRIGGERED_KEY, 'true');
      const intendedDestination = location.pathname;

      if (isMobileDevice()) {
        // Mobile: Use redirect-based auth
        loginWithRedirect({
          appState: { returnTo: intendedDestination },
          authorizationParams: {
            redirect_uri: `${window.location.origin}/callback`,
            scope: 'openid profile email',
          },
        });
      } else {
        // Desktop top-level: Use popup-based auth
        loginWithPopup({
          authorizationParams: {
            redirect_uri: `${window.location.origin}/callback`,
            scope: 'openid profile email',
          },
        }).then(() => {
          sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
        }).catch(() => {
          sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
        });
      }
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect, loginWithPopup]);

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
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoggingIn(false);
    }
  };

  // When in iframe and not authenticated, show a login button (popup from inside iframe)
  if (isInIframe() && !isAuthenticated && !loading && !auth0Loading) {
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

  if (loading || auth0Loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
