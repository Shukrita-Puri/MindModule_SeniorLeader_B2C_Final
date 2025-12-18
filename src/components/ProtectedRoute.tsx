import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { isMobileDevice, CANONICAL_APP_URL } from "@/utils/authRedirect";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, loginWithPopup, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const loginTriggered = useRef(false);

  console.log('[ProtectedRoute]', {
    pathname: location.pathname,
    loading,
    isAuthenticated,
    isMobile: isMobileDevice()
  });

  useEffect(() => {
    // If not authenticated and not loading, trigger login
    if (!loading && !auth0Loading && !isAuthenticated && !loginTriggered.current) {
      loginTriggered.current = true;
      const intendedDestination = location.pathname;

      if (isMobileDevice()) {
        // Mobile: Use redirect-based auth (popups unreliable on mobile)
        console.log('[ProtectedRoute] Mobile device, using redirect auth');
        loginWithRedirect({
          appState: { returnTo: intendedDestination },
          authorizationParams: {
            redirect_uri: `${CANONICAL_APP_URL}/callback`,
            scope: 'openid profile email',
          },
        });
      } else {
        // Desktop: Use popup-based auth (allows staying in iframe)
        console.log('[ProtectedRoute] Desktop, using popup auth');
        loginWithPopup({
          authorizationParams: {
            redirect_uri: `${CANONICAL_APP_URL}/callback`,
            scope: 'openid profile email',
          },
        }).then(() => {
          console.log('[ProtectedRoute] Popup login successful');
          // Auth state will update automatically via onAuthStateChange
        }).catch((error) => {
          console.error('[ProtectedRoute] Popup login error:', error);
          loginTriggered.current = false; // Allow retry
        });
      }
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect, loginWithPopup]);

  if (loading || auth0Loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show loading while auth is happening
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
