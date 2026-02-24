import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getRedirectUri, nativeLogin } from '@/utils/nativeAuth';
import { isLogoutGuardActive, clearLogoutGuard } from '@/utils/logoutGuard';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);

  const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                           location.search.includes('from=onboarding');

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      navigate(isOnboardingFlow ? '/onboarding/results' : '/executive-home');
      return;
    }

    // Don't auto-trigger auth if user just signed out
    if (isLogoutGuardActive()) {
      console.log('[Signup] Logout guard active, skipping auto-signup');
      navigate('/', { replace: true });
      return;
    }

    if (redirectInitiated.current) return;
    redirectInitiated.current = true;

    clearLogoutGuard();

    const returnTo = isOnboardingFlow ? '/onboarding/results' : '/executive-home';

    // On iOS native, open in-app browser
    (async () => {
      const handled = await nativeLogin({ returnTo, screenHint: 'signup' });
      if (handled) return;

      const baseRedirect = getRedirectUri();
      const redirectUri = isOnboardingFlow 
        ? `${baseRedirect}?from=onboarding`
        : baseRedirect;

      loginWithRedirect({
        appState: { returnTo },
        authorizationParams: {
          redirect_uri: redirectUri,
          screen_hint: 'signup',
          scope: 'openid profile email offline_access',
        },
      });
    })();
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, isOnboardingFlow]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to signup...</p>
      </div>
    </div>
  );
};

export default Signup;
