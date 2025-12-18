import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { isInIframe, CANONICAL_APP_URL } from "@/utils/authRedirect";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const loginTriggered = useRef(false);

  console.log('[ProtectedRoute]', {
    pathname: location.pathname,
    loading,
    isAuthenticated,
    isInIframe: isInIframe()
  });

  useEffect(() => {
    // If not authenticated and not loading, trigger login directly
    if (!loading && !auth0Loading && !isAuthenticated && !loginTriggered.current) {
      loginTriggered.current = true;
      const intendedDestination = location.pathname;

      if (isInIframe()) {
        // In iframe: open Auth0 in a new tab at canonical URL
        console.log('[ProtectedRoute] In iframe, opening Auth0 in new tab');
        const authUrl = `${CANONICAL_APP_URL}/login?returnTo=${encodeURIComponent(intendedDestination)}`;
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      } else {
        // Not in iframe: trigger Auth0 redirect directly
        console.log('[ProtectedRoute] Triggering Auth0 redirect directly');
        loginWithRedirect({
          appState: { returnTo: intendedDestination },
          authorizationParams: {
            redirect_uri: `${CANONICAL_APP_URL}/callback`,
            scope: 'openid profile email',
          },
        });
      }
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect]);

  if (loading || auth0Loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show loading while redirect is happening
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
