import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { isMobileDevice, CANONICAL_APP_URL } from "@/utils/authRedirect";
import { Button } from "@/components/ui/button";

const LOGIN_TRIGGERED_KEY = 'auth_login_triggered';
const POPUP_COMPLETED_KEY = 'auth_popup_completed';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, loginWithPopup, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const [showFallback, setShowFallback] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  console.log('[ProtectedRoute]', {
    pathname: location.pathname,
    loading,
    isAuthenticated,
    isMobile: isMobileDevice(),
    loginInProgress: sessionStorage.getItem(LOGIN_TRIGGERED_KEY),
    showFallback
  });

  // Clear login flags when successfully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      sessionStorage.removeItem(POPUP_COMPLETED_KEY);
      setShowFallback(false);
    }
  }, [isAuthenticated]);

  // Check if popup completed but auth didn't sync
  useEffect(() => {
    const popupCompleted = sessionStorage.getItem(POPUP_COMPLETED_KEY);
    if (popupCompleted === 'true' && !loading && !auth0Loading && !isAuthenticated) {
      // Popup completed but still not authenticated - show fallback
      const timer = setTimeout(() => {
        setShowFallback(true);
        sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, auth0Loading, isAuthenticated]);

  useEffect(() => {
    const loginInProgress = sessionStorage.getItem(LOGIN_TRIGGERED_KEY);
    
    // If not authenticated, not loading, no login in progress, and not showing fallback
    if (!loading && !auth0Loading && !isAuthenticated && loginInProgress !== 'true' && !showFallback) {
      sessionStorage.setItem(LOGIN_TRIGGERED_KEY, 'true');
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
          sessionStorage.setItem(POPUP_COMPLETED_KEY, 'true');
          // Give Auth0 time to update state
          setTimeout(() => {
            sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
          }, 2000);
        }).catch((error) => {
          console.error('[ProtectedRoute] Popup login error:', error);
          sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
          // Show fallback on popup error (blocked, closed, etc.)
          setShowFallback(true);
        });
      }
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect, loginWithPopup, showFallback]);

  const handleRetryLogin = async () => {
    setIsRetrying(true);
    setShowFallback(false);
    sessionStorage.removeItem(LOGIN_TRIGGERED_KEY);
    sessionStorage.removeItem(POPUP_COMPLETED_KEY);
    
    try {
      await loginWithPopup({
        authorizationParams: {
          redirect_uri: `${CANONICAL_APP_URL}/callback`,
          scope: 'openid profile email',
        },
      });
      sessionStorage.setItem(POPUP_COMPLETED_KEY, 'true');
    } catch (error) {
      console.error('[ProtectedRoute] Retry popup error:', error);
      setShowFallback(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleOpenInPreview = () => {
    const previewUrl = `${CANONICAL_APP_URL}${location.pathname}`;
    window.open(previewUrl, '_blank');
  };

  if (loading || auth0Loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show fallback UI when popup auth failed to sync
  if (showFallback && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Session couldn't sync</h2>
            <p className="text-muted-foreground text-sm">
              Your login may have completed, but the session couldn't sync back to this window. 
              This can happen in embedded views.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleRetryLogin} 
              disabled={isRetrying}
              className="w-full"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Retry Login
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleOpenInPreview}
              className="w-full"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Preview
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Opening in preview will give you full access to all features.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show loading while auth is happening
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
