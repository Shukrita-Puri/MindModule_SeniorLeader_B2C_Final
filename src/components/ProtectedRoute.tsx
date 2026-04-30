import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, nativeLoginHandled, isNativeAuthBusy, isNativeAuthCompleted, hasRecoverableNativeSession, resetStaleNativeAuth, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { isLogoutGuardActive } from "@/utils/logoutGuard";
import { isPreviewContext } from "@/utils/previewAuth";
import DelayedFallback from "@/components/ui/delayed-fallback";

// Grace period before triggering login redirect (ms)
// Allows auth restoration, native hydration, and profile sync to complete
const LOGIN_REDIRECT_GRACE_MS = 3000;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (DEV_MODE) {
    return <>{children}</>;
  }
  // Preview contexts (Lovable iframe / *.lovable.app) render children
  // without forcing an Auth0 redirect. Components that need real data
  // already fall back to preview-safe mocks via `shouldUsePreviewMock`.
  if (isPreviewContext()) {
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

  // Start a grace timer on mount – don't trigger login until it expires
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
    // Still loading – wait
    if (loading || auth0Loading) return;

    // Authenticated – we're done
    if (isAuthenticated) return;

    // Logout guard – redirect to landing instead of re-authing
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
    if (isNativeAuthCompleted() && !hasRecoverableNativeSession()) {
      console.log('[ProtectedRoute] Stale native completion flag without tokens, clearing...');
      resetStaleNativeAuth();
    } else if (isNativeAuthCompleted()) {
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
        const result = await nativeLogin({ returnTo: location.pathname });
        if (nativeLoginHandled(result)) return;

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

  // Session verification happens silently. We render a transparent placeholder
  // immediately (so child page-specific loaders own the visible loading UI),
  // and only fall back to a generic loader if verification stretches past 3s.
  if (loading || auth0Loading || !isAuthenticated) {
    return <DelayedFallback />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
