import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Signup = () => {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
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

    // Auto-redirect after small delay to ensure Auth0 SDK is initialized
    const timer = setTimeout(() => {
      const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                               window.location.search.includes('from=onboarding');
      const redirect_uri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
      
      console.log('[Signup] Auto-redirecting to Auth0:', { redirect_uri, isOnboardingFlow });
      
      // Force full page redirect using openUrl to prevent iframe blocking
      loginWithRedirect({
        authorizationParams: {
          redirect_uri,
          screen_hint: 'signup',
        },
        async openUrl(url) {
          console.log('[Signup] Full page redirect to:', url);
          window.location.replace(url);
        }
      }).catch((err) => {
        console.error('[Signup] loginWithRedirect failed:', err);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, loginWithRedirect, navigate]);

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
