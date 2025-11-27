import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                             location.search.includes('from=onboarding');

    console.log('[Signup] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: location.pathname,
      search: location.search,
      isOnboardingFlow
    });

    if (isLoading) return;

    if (isAuthenticated) {
      if (isOnboardingFlow) {
        console.log('[Signup] Already authenticated in onboarding, redirecting to /onboarding/results');
        navigate('/onboarding/results');
      } else {
        console.log('[Signup] Already authenticated, redirecting to executive-home');
        navigate('/executive-home');
      }
      return;
    }

    (async () => {
      console.log('[Signup] Opening Auth0 signup popup', { isOnboardingFlow });
      try {
        await loginWithPopup({
          authorizationParams: {
            screen_hint: 'signup',
            scope: 'openid profile email',
          },
        });

        if (isOnboardingFlow) {
          console.log('[Signup] Popup signup complete, redirecting to /onboarding/results');
          navigate('/onboarding/results');
        } else {
          console.log('[Signup] Popup signup complete, redirecting to /executive-home');
          navigate('/executive-home');
        }
      } catch (error) {
        console.error('[Signup] Popup signup error:', error);
        navigate('/signup?error=auth_failed');
      }
    })();
  }, [isLoading, isAuthenticated, navigate, location, loginWithPopup]);

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
