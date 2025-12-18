import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2, ExternalLink } from "lucide-react";
import { isMobileDevice, isInIframe, CANONICAL_APP_URL } from "@/utils/authRedirect";
import { Button } from "@/components/ui/button";

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
    
    // Don't auto-trigger login if in iframe - we'll show a prompt instead
    if (isInIframe()) return;
    
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
      } else {
        // Desktop: Use popup-based auth
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

  // When in iframe and not authenticated, show a prompt to open in new tab
  if (isInIframe() && !isAuthenticated && !loading && !auth0Loading) {
    const targetUrl = `${CANONICAL_APP_URL}${location.pathname}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-xl font-heading font-semibold text-foreground">Open in New Tab</h2>
          <p className="text-muted-foreground text-sm">
            Authentication doesn't work in the editor preview due to browser security. 
            Please open the app in a new tab to log in.
          </p>
          <Button 
            onClick={() => window.open(targetUrl, '_blank', 'noopener,noreferrer')}
            className="gap-2"
          >
            <ExternalLink size={16} />
            Open App in New Tab
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
