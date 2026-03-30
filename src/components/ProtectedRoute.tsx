import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, isNativeAuthBusy, isNativeAuthCompleted, hasRecoverableNativeSession, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { isLogoutGuardActive } from "@/utils/logoutGuard";

// Grace period before triggering login redirect (ms)
// Allows auth restoration, native hydration, and profile sync to complete
const LOGIN_REDIRECT_GRACE_MS = 3000;

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
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);
  const [graceExpired, setGraceExpired] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start a grace timer on mount — don't trigger login until it expires
  useEffect(() => {
    graceTimerRef.current = setTimeout(() => {
      setGraceExpired(true);
      console.log('[ProtectedRoute] Grace period expired');
    }, LOGIN_REDIRECT_GRACE_MS);
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    };
  }, []);

  // Cancel grace timer early if auth resolves
  useEffect(() => {
    if (isAuthenticated && graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Still loading — wait
    if (loading || auth0Loading) return;

    // Authenticated — we're done
    if (isAuthenticated) return;

    // Logout guard — redirect to landing instead of re-authing
    if (isLogoutGuardActive()) {
      console.log('[ProtectedRoute] Logout guard active, redirecting to /');
      navigate('/', { replace: true });
      return;
    }

    // Don't trigger login if native auth flow is still in progress
    if (isNativeAuthBusy()) {
      console.log('[ProtectedRoute] Native auth busy, waiting...');
      return;
    }
    if (isNativeAuthCompleted()) {
      console.log('[ProtectedRoute] Native auth completed, waiting for hydration...');
      return;
    }
    // If there's a recoverable native session, wait for useAuth to refresh it
    if (hasRecoverableNativeSession()) {
      console.log('[ProtectedRoute] Recoverable native session exists, waiting for refresh...');
      return;
    }

    // Grace period: don't trigger login too early during startup
    if (!graceExpired) {
      console.log('[ProtectedRoute] Within grace period, waiting before login redirect...');
      return;
    }

    if (!redirectInitiated.current) {
      redirectInitiated.current = true;
      console.log('[ProtectedRoute] Auth not recovered after grace period, triggering login for:', location.pathname);

      (async () => {
        const handled = await nativeLogin({ returnTo: location.pathname });
        if (handled) return;

        loginWithRedirect({
          appState: { returnTo: location.pathname },
          authorizationParams: {
            redirect_uri: getRedirectUri(),
            audience: getSanitisedAuth0Audience(),
            scope: 'openid profile email offline_access',
          },
        });
      })();
    }
  }, [loading, auth0Loading, isAuthenticated, location.pathname, loginWithRedirect, navigate, graceExpired]);

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
