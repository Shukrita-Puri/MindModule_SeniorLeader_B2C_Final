import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { isMobileDevice, isInIframe, openAuthInNewTab, CANONICAL_APP_URL } from "@/utils/authRedirect";

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, loginWithPopup, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();

  // Clear login flag when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
    }
  }, [isAuthenticated]);

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
            redirect_uri: `${CANONICAL_APP_URL}/callback`,
            scope: 'openid profile email',
          },
        });
      } else if (isInIframe()) {
        // Desktop in iframe: Open auth in new tab
        openAuthInNewTab(intendedDestination);
      } else {
        // Desktop outside iframe: Use popup-based auth
        loginWithPopup({
          authorizationParams: {
            redirect_uri: `${CANONICAL_APP_URL}/callback`,
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
