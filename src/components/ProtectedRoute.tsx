import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, isNativeLoginInProgress, isNativeAuthCompleted } from "@/utils/nativeAuth";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (DEV_MODE) {
    return <>{children}</>;
  }
  return <Auth0ProtectedRoute>{children}</Auth0ProtectedRoute>;
};

const Auth0ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { loginWithRedirect, isLoading: auth0Loading } = useAuth0();
  const location = useLocation();
  const redirectInitiated = useRef(false);

  useEffect(() => {
    if (loading || auth0Loading) return;

    // If authenticated (either SDK or native hydration), we're done
    if (isAuthenticated) return;

    if (!redirectInitiated.current) {
      // Don't trigger login if native auth is in progress or completed (hydration pending)
      if (isNativeLoginInProgress()) {
        console.log('[ProtectedRoute] Native login in progress, waiting...');
        return;
      }
      if (isNativeAuthCompleted()) {
        console.log('[ProtectedRoute] Native auth completed, waiting for hydration...');
        return;
      }

      redirectInitiated.current = true;

      // On iOS native, open in-app browser
      (async () => {
        const handled = await nativeLogin({ returnTo: location.pathname });
        if (handled) return;

        loginWithRedirect({
          appState: { returnTo: location.pathname },
          authorizationParams: {
            redirect_uri: getRedirectUri(),
            scope: 'openid profile email',
          },
        });
      })();
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect]);

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
