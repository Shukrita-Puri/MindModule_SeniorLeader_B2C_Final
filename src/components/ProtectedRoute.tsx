import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { DEV_MODE } from "@/config/devMode";

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

    if (!isAuthenticated && !redirectInitiated.current) {
      redirectInitiated.current = true;
      loginWithRedirect({
        appState: { returnTo: location.pathname },
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
          scope: 'openid profile email',
        },
      });
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
