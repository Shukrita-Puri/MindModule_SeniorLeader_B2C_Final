import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Signup] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname,
      search: window.location.search
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Signup] Already authenticated, redirecting to executive-home');
      navigate('/executive-home');
      return;
    }

    // Use Auth0 SDK loginWithRedirect for proper PKCE flow
    const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                             window.location.search.includes('from=onboarding');
    const redirectUri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
    
    console.log('[Signup] Redirecting to Auth0 with loginWithRedirect:', { redirectUri });
    
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        screen_hint: 'signup',
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate]);

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
