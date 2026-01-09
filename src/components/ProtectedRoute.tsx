import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2, LogIn } from "lucide-react";
import { isMobileDevice, isInIframe } from "@/utils/authRedirect";
import { Button } from "@/components/ui/button";
import { DEV_MODE } from "@/config/devMode";

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  // Dev mode: render children immediately
  if (DEV_MODE) {
    return <>{children}</>;
  }

  // Production mode: use Auth0 protection
  return <Auth0ProtectedRoute>{children}</Auth0ProtectedRoute>;
};

// Separate component for Auth0 logic to avoid hook rules issues
const Auth0ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, loginWithPopup, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Clear login flag when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      setIsLoggingIn(false);
      setPopupBlocked(false);
    }
  }, [isAuthenticated]);

  // Auto-trigger login
  useEffect(() => {
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
        // Desktop (including iframe): Try popup-based auth
        loginWithPopup({
          authorizationParams: {
            redirect_uri: `${window.location.origin}/callback`,
            scope: 'openid profile email',
          },
        }).then(() => {
          sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
        }).catch((error) => {
          console.error('Popup login failed:', error);
          sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
          // If popup was blocked, show fallback button
          if (error?.message?.includes('blocked') || error?.message?.includes('closed')) {
            setPopupBlocked(true);
          }
        });
      }
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect, loginWithPopup]);

  // Handle manual login button click (fallback when popup blocked)
  const handleManualLogin = async () => {
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

  // Only show button if popup was blocked
  if (popupBlocked && !isAuthenticated && !loading && !auth0Loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-xl font-heading font-semibold text-foreground">Popup Blocked</h2>
          <p className="text-muted-foreground text-sm">
            Your browser blocked the login popup. Click below to try again.
          </p>
          <Button 
            onClick={handleManualLogin}
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
